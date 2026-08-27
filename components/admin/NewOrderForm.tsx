"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { createOrder } from "@/lib/actions/orders";
import { PasteParseBox } from "./PasteParseBox";
import type { ParseResult } from "@/lib/actions/parse";
import type { Customer, Service, FormFieldDef } from "@/lib/types";

type SelectedService = {
  quantity: number;
  form_details: Record<string, string>;
  /** keys auto-filled by Paste & Parse — highlighted until staff edits them */
  parsedKeys: string[];
  /** required keys the parser could not find — flagged for staff */
  missingKeys: string[];
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

export function NewOrderForm({ services }: { services: Service[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // --- Customer ---
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [picked, setPicked] = useState<Customer | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ ...emptyNewCustomer });

  // --- Services ---
  const [selected, setSelected] = useState<Record<string, SelectedService>>({});

  // --- Status ---
  const [initialStatus, setInitialStatus] =
    useState<"new_inquiry" | "details_received">("details_received");

  async function runSearch() {
    setSearching(true);
    try {
      setResults(await searchCustomers(query));
    } finally {
      setSearching(false);
    }
  }

  function toggleService(svc: Service) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[svc.id]) {
        delete next[svc.id];
      } else {
        next[svc.id] = {
          quantity: 1,
          form_details: {},
          parsedKeys: [],
          missingKeys: [],
        };
      }
      return next;
    });
  }

  function setField(svcId: string, key: string, value: string) {
    setSelected((prev) => ({
      ...prev,
      [svcId]: {
        ...prev[svcId],
        form_details: { ...prev[svcId].form_details, [key]: value },
        // Staff has reviewed this field — drop the auto-filled highlight.
        parsedKeys: prev[svcId].parsedKeys.filter((k) => k !== key),
        missingKeys: value.trim()
          ? prev[svcId].missingKeys.filter((k) => k !== key)
          : prev[svcId].missingKeys,
      },
    }));
  }

  /**
   * Apply a parse result into the editable form (§9) — never auto-saved.
   * Existing typed values are preserved; only blank fields are filled.
   */
  function applyParse(serviceId: string, result: ParseResult) {
    setSelected((prev) => {
      const current = prev[serviceId];
      if (!current) return prev;
      const details = { ...current.form_details };
      const newlyFilled: string[] = [];
      for (const [key, value] of Object.entries(result.values)) {
        if (!details[key]?.trim()) {
          details[key] = value;
          newlyFilled.push(key);
        }
      }
      return {
        ...prev,
        [serviceId]: {
          ...current,
          form_details: details,
          parsedKeys: Array.from(
            new Set([...current.parsedKeys, ...newlyFilled])
          ),
          missingKeys: result.missingRequired,
        },
      };
    });
  }

  function setQty(svcId: string, qty: number) {
    setSelected((prev) => ({
      ...prev,
      [svcId]: { ...prev[svcId], quantity: Math.max(1, qty) },
    }));
  }

  const chosen = services.filter((s) => selected[s.id]);
  const total = chosen.reduce(
    (sum, s) => sum + Number(s.price) * (selected[s.id]?.quantity ?? 1),
    0
  );

  async function submit() {
    setError(null);
    if (chosen.length === 0) {
      setError("Pick at least one service.");
      return;
    }

    startTransition(async () => {
      try {
        // Resolve customer id.
        let customerId = picked?.id ?? null;
        if (mode === "new") {
          if (!newCustomer.full_name.trim()) {
            setError("Enter the customer's name.");
            return;
          }
          const { id } = await createCustomer(newCustomer);
          customerId = id;
        }
        if (!customerId) {
          setError("Pick an existing customer or create a new one.");
          return;
        }

        const { id } = await createOrder({
          customer_id: customerId,
          initial_status: initialStatus,
          items: chosen.map((s) => ({
            service_id: s.id,
            quantity: selected[s.id].quantity,
            price_at_order: Number(s.price),
            form_details: selected[s.id].form_details,
          })),
        });
        router.push(`/orders/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Paste & Parse (§9) — fills the editable form below, never auto-saves */}
      <PasteParseBox services={chosen} onParsed={applyParse} />

      {/* Step 1: Customer */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">1 · Customer</CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "pick" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("pick")}
            >
              <Search className="h-4 w-4" /> Pick existing
            </Button>
            <Button
              type="button"
              variant={mode === "new" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("new")}
            >
              <UserPlus className="h-4 w-4" /> New customer
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name *">
                <Input
                  value={newCustomer.full_name}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, full_name: e.target.value })
                  }
                />
              </Field>
              <Field label="Phone (PH mobile)">
                <Input
                  value={newCustomer.phone}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, phone: e.target.value })
                  }
                />
              </Field>
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
                    setNewCustomer({ ...newCustomer, barangay: e.target.value })
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
                    setNewCustomer({ ...newCustomer, province: e.target.value })
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
        </CardContent>
      </Card>

      {/* Step 2: Services + per-service form details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · Services &amp; details</CardTitle>
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
              <div className="grid gap-3 sm:grid-cols-2">
                {(s.form_fields ?? []).map((f: FormFieldDef) => {
                  const wasParsed = selected[s.id].parsedKeys.includes(f.key);
                  const isMissing = selected[s.id].missingKeys.includes(f.key);
                  const tone = wasParsed
                    ? "border-amber-400 bg-amber-50"
                    : isMissing
                      ? "border-red-300 bg-red-50"
                      : "";
                  return (
                    <Field
                      key={f.key}
                      label={f.required ? `${f.label} *` : f.label}
                      hint={
                        wasParsed
                          ? "auto-filled — please check"
                          : isMissing
                            ? "not found — enter manually"
                            : undefined
                      }
                      hintTone={wasParsed ? "parsed" : "missing"}
                      className={f.type === "textarea" ? "sm:col-span-2" : ""}
                    >
                      {f.type === "textarea" ? (
                        <Textarea
                          className={tone}
                          value={selected[s.id].form_details[f.key] ?? ""}
                          onChange={(e) => setField(s.id, f.key, e.target.value)}
                        />
                      ) : (
                        <Input
                          className={tone}
                          type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                          value={selected[s.id].form_details[f.key] ?? ""}
                          onChange={(e) => setField(s.id, f.key, e.target.value)}
                        />
                      )}
                    </Field>
                  );
                })}
              </div>
            </div>
          ))}
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

          <div className="flex items-center justify-between border-t pt-4">
            <p className="text-lg font-semibold">Total: {peso(total)}</p>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Creating…" : "Create order"}
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
  hintTone,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
  hintTone?: "parsed" | "missing";
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        {hint && (
          <span
            className={`text-[11px] ${
              hintTone === "missing" ? "text-red-600" : "text-amber-700"
            }`}
          >
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
