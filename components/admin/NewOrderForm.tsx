"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  UserPlus,
  UserCheck,
  X,
  ChevronDown,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/action-result";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { peso } from "@/lib/money";
import { searchCustomers, createCustomer } from "@/lib/actions/customers";
import {
  findDuplicateOrders,
  type DuplicateReport,
} from "@/lib/actions/duplicates";
import { DuplicateWarning } from "./DuplicateWarning";
import { createOrder } from "@/lib/actions/orders";
import type { Customer, MessengerPage, Service } from "@/lib/types";

type SelectedService = {
  quantity: number;
  /** The customer's filled-out form, pasted from Messenger exactly as sent. */
  pasted_details: string;
};

const emptyNewCustomer = {
  full_name: "",
  phone: "",
  messenger_name: "",
  messenger_link: "",
  address_line: "",
  barangay: "",
  city: "",
  province: "",
  zip: "",
  notes: "",
};

/**
 * Staff intake: name → document → paste the customer's reply → create.
 *
 * The paste is stored verbatim, not parsed into fields. A parser that guesses
 * wrong on a PSA detail gets the application rejected, and checking its guesses
 * costs more staff time than it saves. The printable PSA form is filled in on
 * the order itself, when there is actually a form to print.
 */
export function NewOrderForm({
  services,
  messengerPages,
  defaultPageId,
}: {
  services: Service[];
  messengerPages: MessengerPage[];
  /** This staff member's own page, so the VA's orders default to hers. */
  defaultPageId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // --- Customer ---
  const [mode, setMode] = useState<"new" | "pick">("new");
  const [picked, setPicked] = useState<Customer | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ ...emptyNewCustomer });
  const [showAddress, setShowAddress] = useState(false);

  // --- Services ---
  const [selected, setSelected] = useState<Record<string, SelectedService>>({});

  // --- Status ---
  const [initialStatus, setInitialStatus] =
    useState<"new_inquiry" | "details_received">("details_received");

  // --- Which Facebook page the tracking link points at ---
  const [pageId, setPageId] = useState<string | null>(defaultPageId);

  // --- Duplicate check ---
  // Held until the staff member has seen it; `acknowledged` is what lets the
  // second submit through, so the warning can't be skipped by double-clicking.
  const [dupes, setDupes] = useState<DuplicateReport | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [checking, setChecking] = useState(false);
  const [existing, setExisting] = useState<Customer[]>([]);

  // Look the typed name/phone up as they go, so a customer already on file is
  // spotted before a second record is created for them.
  useEffect(() => {
    if (mode !== "new") {
      setExisting([]);
      return;
    }
    const name = newCustomer.full_name.trim();
    const phone = newCustomer.phone.trim();
    if (name.length < 4 && phone.length < 7) {
      setExisting([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = unwrap(
          await findDuplicateOrders({
            full_name: name,
            phone,
            service_ids: [],
          })
        );
        if (!cancelled) setExisting(r.existingCustomers);
      } catch {
        /* a failed hint is not worth interrupting intake for */
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, newCustomer.full_name, newCustomer.phone]);

  useEffect(() => {
    setAcknowledged(false);
    setDupes(null);
  }, [picked?.id, newCustomer.full_name, newCustomer.phone, mode]);

  async function runSearch() {
    setSearching(true);
    try {
      setResults(unwrap(await searchCustomers(query)));
    } finally {
      setSearching(false);
    }
  }

  function toggleService(svc: Service) {
    // The warning was about a specific set of documents — changing them makes
    // it stale, so it has to be earned again.
    setAcknowledged(false);
    setDupes(null);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[svc.id]) delete next[svc.id];
      else next[svc.id] = { quantity: 1, pasted_details: "" };
      return next;
    });
  }

  function setPaste(svcId: string, value: string) {
    setSelected((prev) => ({
      ...prev,
      [svcId]: { ...prev[svcId], pasted_details: value },
    }));
  }

  function setQty(svcId: string, qty: number) {
    setSelected((prev) => ({
      ...prev,
      [svcId]: { ...prev[svcId], quantity: Math.max(1, qty) },
    }));
  }

  const selectedPage = messengerPages.find((p) => p.id === pageId) ?? null;
  const chosen = services.filter((s) => selected[s.id]);
  const total = chosen.reduce(
    (sum, s) => sum + Number(s.price) * (selected[s.id]?.quantity ?? 1),
    0
  );

  async function submit(force = false) {
    setError(null);
    if (chosen.length === 0) {
      setError("Pick at least one document.");
      return;
    }
    const name = mode === "new" ? newCustomer.full_name.trim() : picked?.full_name ?? "";
    if (mode === "new" && !name) {
      setError("Enter the customer's full name.");
      return;
    }
    if (mode === "pick" && !picked) {
      setError("Pick an existing customer or enter a new one.");
      return;
    }

    // Warn once, then let them through. Checked here rather than on the server
    // side of createOrder so the staff member sees the actual orders and can
    // open them, instead of just being refused.
    if (!force && !acknowledged) {
      setChecking(true);
      try {
        const report = unwrap(
          await findDuplicateOrders({
            full_name: name,
            phone: mode === "new" ? newCustomer.phone : picked?.phone ?? null,
            customer_id: picked?.id ?? null,
            service_ids: chosen.map((s) => s.id),
          })
        );
        if (report.matches.length > 0) {
          setDupes(report);
          setChecking(false);
          return;
        }
      } catch {
        // A check that can't run shouldn't stop an order being taken.
      }
      setChecking(false);
    }

    startTransition(async () => {
      try {
        let customerId = picked?.id ?? null;
        if (mode === "new") {
          const created = unwrap(await createCustomer(newCustomer));
          customerId = created.id;
        }
        if (!customerId) {
          setError("Pick an existing customer or enter a new one.");
          return;
        }

        const { id } = unwrap(
          await createOrder({
            customer_id: customerId,
            initial_status: initialStatus,
            messenger_page_id: pageId,
            items: chosen.map((s) => ({
              service_id: s.id,
              quantity: selected[s.id].quantity,
              price_at_order: Number(s.price),
              pasted_details: selected[s.id].pasted_details,
            })),
          })
        );
        router.push(`/orders/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  /** Switch to the existing customer record instead of making a second one. */
  function useExisting(c: Customer) {
    setPicked(c);
    setMode("pick");
    setExisting([]);
    setAcknowledged(false);
    setDupes(null);
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Customer */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">1 · Customer</CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "new" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("new")}
            >
              <UserPlus className="h-4 w-4" /> New customer
            </Button>
            <Button
              type="button"
              variant={mode === "pick" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("pick")}
            >
              <Search className="h-4 w-4" /> Pick existing
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mode === "pick" ? (
            picked ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3">
                <div>
                  <p className="font-medium">{picked.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {picked.phone ?? "no phone"} ·{" "}
                    {[picked.city, picked.province].filter(Boolean).join(", ") ||
                      "no address"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPicked(null)}
                >
                  <X className="h-4 w-4" /> Change
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by name or phone"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        runSearch();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={runSearch}>
                    {searching ? "…" : "Search"}
                  </Button>
                </div>
                <div className="divide-y rounded-md border">
                  {results.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setPicked(c)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span>{c.full_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.phone}
                      </span>
                    </button>
                  ))}
                  {results.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      Search to find an existing customer, or switch to “New
                      customer”.
                    </p>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Full name *">
                  <Input
                    autoFocus
                    placeholder="Juan Dela Cruz"
                    value={newCustomer.full_name}
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        full_name: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field
                  label="Mobile number"
                  hint="for the tracking SMS"
                >
                  <Input
                    placeholder="09XXXXXXXXX"
                    value={newCustomer.phone}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, phone: e.target.value })
                    }
                  />
                </Field>
              </div>

              {existing.length > 0 && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-sky-900">
                    <UserCheck className="h-4 w-4 shrink-0" />
                    Already on file
                  </p>
                  <p className="mt-0.5 text-xs text-sky-800">
                    Use the existing record so their order history stays in one
                    place.
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {existing.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-2"
                      >
                        <span className="text-sm">
                          <span className="font-medium">{c.full_name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {c.phone ?? "no phone"}
                            {c.city ? ` · ${c.city}` : ""}
                          </span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => useExisting(c)}
                        >
                          Use this customer
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Delivery address is only needed once the order ships, so it
                  stays out of the way during intake. */}
              <button
                type="button"
                onClick={() => setShowAddress((v) => !v)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showAddress ? "" : "-rotate-90"}`}
                />
                Delivery address &amp; Messenger {showAddress ? "" : "(optional now)"}
              </button>

              {showAddress && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Messenger name">
                    <Input
                      value={newCustomer.messenger_name}
                      onChange={(e) =>
                        setNewCustomer({
                          ...newCustomer,
                          messenger_name: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Messenger link">
                    <Input
                      value={newCustomer.messenger_link}
                      onChange={(e) =>
                        setNewCustomer({
                          ...newCustomer,
                          messenger_link: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Address line" className="sm:col-span-2">
                    <Input
                      value={newCustomer.address_line}
                      onChange={(e) =>
                        setNewCustomer({
                          ...newCustomer,
                          address_line: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Barangay">
                    <Input
                      value={newCustomer.barangay}
                      onChange={(e) =>
                        setNewCustomer({
                          ...newCustomer,
                          barangay: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="City / Municipality">
                    <Input
                      value={newCustomer.city}
                      onChange={(e) =>
                        setNewCustomer({ ...newCustomer, city: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Province">
                    <Input
                      value={newCustomer.province}
                      onChange={(e) =>
                        setNewCustomer({
                          ...newCustomer,
                          province: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="ZIP">
                    <Input
                      value={newCustomer.zip}
                      onChange={(e) =>
                        setNewCustomer({ ...newCustomer, zip: e.target.value })
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Documents + the pasted reply */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm hover:bg-accent/40"
              >
                <input
                  type="checkbox"
                  checked={!!selected[s.id]}
                  onChange={() => toggleService(s)}
                  className="h-4 w-4"
                />
                <span className="flex-1">{s.name}</span>
                <span className="text-muted-foreground">{peso(s.price)}</span>
              </label>
            ))}
          </div>

          {chosen.map((s) => (
            <div key={s.id} className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-medium">{s.name}</p>
                <div className="flex items-center gap-2 text-sm">
                  <Label htmlFor={`qty-${s.id}`}>Qty</Label>
                  <Input
                    id={`qty-${s.id}`}
                    type="number"
                    min={1}
                    className="h-8 w-20"
                    value={selected[s.id].quantity}
                    onChange={(e) => setQty(s.id, Number(e.target.value))}
                  />
                </div>
              </div>
              <Field
                label="Customer's filled-out form"
                hint="pasted from Messenger, kept exactly as sent"
              >
                <Textarea
                  rows={9}
                  className="font-mono text-xs"
                  value={selected[s.id].pasted_details}
                  onChange={(e) => setPaste(s.id, e.target.value)}
                  placeholder={
                    "Paste the customer's whole reply here, e.g.\n\nFull Name: Juan Dela Cruz\nBirthdate: Jan 5, 1990\nLugar ng kapanganakan: Quezon City\nPangalan ng ina: Maria Santos\nPangalan ng ama: Pedro Dela Cruz"
                  }
                />
              </Field>
            </div>
          ))}

          {chosen.length === 0 && (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Pick a document above, then paste the customer&apos;s reply.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Status + submit */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3 · Create</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-medium">Initial status:</span>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="init"
                checked={initialStatus === "details_received"}
                onChange={() => setInitialStatus("details_received")}
              />
              Details received (form encoded)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="init"
                checked={initialStatus === "new_inquiry"}
                onChange={() => setInitialStatus("new_inquiry")}
              />
              New inquiry (stub, waiting for details)
            </label>
          </div>

          {messengerPages.length > 1 && (
            <div className="border-t pt-4">
              <Field
                label="Facebook page for the tracking link"
                hint="where this customer will message you"
              >
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={pageId ?? ""}
                  onChange={(e) => setPageId(e.target.value || null)}
                >
                  {messengerPages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {selectedPage && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{selectedPage.url}</span>
                </p>
              )}
            </div>
          )}

          {dupes && dupes.matches.length > 0 && (
            <DuplicateWarning
              matches={dupes.matches}
              pending={pending}
              onCancel={() => setDupes(null)}
              onProceed={() => {
                setAcknowledged(true);
                setDupes(null);
                submit(true);
              }}
            />
          )}

          <div className="flex items-center justify-between border-t pt-4">
            <p className="text-lg font-semibold">Total: {peso(total)}</p>
            <Button
              type="button"
              onClick={() => submit()}
              disabled={pending || checking}
            >
              {checking
                ? "Checking…"
                : pending
                  ? "Creating…"
                  : "Create order"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
  className,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        {hint && (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}
