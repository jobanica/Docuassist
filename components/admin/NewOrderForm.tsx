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
  Wand2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toMessage, unwrap } from "@/lib/action-result";
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
import { PlaceWarnings } from "./PlaceWarnings";
import { checkPlaces } from "@/lib/actions/places";
import { documentPlacePair } from "@/lib/parse/place-fields";
import { PSA_FORMS } from "@/lib/psa-forms";
import { DocumentPhotoScan } from "./DocumentPhotoScan";
import type { PlaceIssue } from "@/lib/parse/places";
import { SurnameWarnings } from "./SurnameWarnings";
import { surnameIssues } from "@/lib/parse/surname";
import { joinLabels, missingRequiredLabels } from "@/lib/required-fields";
import { createOrder } from "@/lib/actions/orders";
import { parsePastedText, type ParseResult } from "@/lib/actions/parse";
import type {
  Customer,
  FormFieldDef,
  MessengerPage,
  Service,
} from "@/lib/types";

type SelectedService = {
  quantity: number;
  /** The customer's filled-out form, pasted from Messenger exactly as sent. */
  pasted_details: string;
  /** PSA form boxes. Filled by auto-fill or by hand; always staff-reviewed. */
  form_details: Record<string, string>;
  /** Keys auto-fill just filled — highlighted until edited. */
  autoFilled: string[];
  /** Whether the field grid is open for this document. */
  fieldsOpen: boolean;
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
  parsingEnabled,
}: {
  services: Service[];
  messengerPages: MessengerPage[];
  /** This staff member's own page, so the VA's orders default to hers. */
  defaultPageId: string | null;
  /** Admin switch (Settings → Auto-fill). Off hides the button entirely. */
  parsingEnabled: boolean;
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

  // --- Auto-fill ---
  const [parsing, setParsing] = useState<string | null>(null);
  const [parseNote, setParseNote] = useState<Record<string, string>>({});
  const [places, setPlaces] = useState<PlaceIssue[]>([]);
  const [placesOk, setPlacesOk] = useState(false);

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
      else
        next[svc.id] = {
          quantity: 1,
          pasted_details: "",
          form_details: {},
          autoFilled: [],
          fieldsOpen: false,
        };
      return next;
    });
  }

  function setPaste(svcId: string, value: string) {
    setSelected((prev) => ({
      ...prev,
      [svcId]: { ...prev[svcId], pasted_details: value },
    }));
  }

  /**
   * Re-check the places after a manual edit, so a correction clears the flag.
   *
   * The document's own pair is read off its schema — birth_*, marriage_* or
   * death_* — rather than assumed to be the birth keys, which is why a marriage
   * certificate's city and province used to pass unchecked.
   */
  function recheckPlaces(
    doc: Record<string, string>,
    cust: typeof newCustomer,
    svcId?: string
  ) {
    const svc = svcId ? services.find((s) => s.id === svcId) : chosen[0];
    const pair = documentPlacePair(svc?.form_fields ?? []);
    checkPlaces([
      ...(pair
        ? [
            {
              group: "birth" as const,
              cityLabel: pair.cityLabel,
              provinceLabel: pair.provinceLabel,
              city: doc[pair.cityKey],
              province: doc[pair.provinceKey],
            },
          ]
        : []),
      {
        group: "delivery" as const,
        cityLabel: "Delivery city",
        provinceLabel: "Delivery province",
        barangayLabel: "Delivery barangay",
        city: cust.city,
        province: cust.province,
        barangay: cust.barangay,
      },
    ])
      .then((res) => {
        if (res.ok) setPlaces(res.value);
      })
      .catch(() => {
        /* a check that cannot run must not block intake */
      });
  }

  /**
   * Edit a delivery field and re-check it. Barangay is in there with city and
   * province now: couriers sort on the barangay, so a wrong one is a returned
   * parcel just as surely as a wrong city.
   */
  function setCust(key: keyof typeof newCustomer, value: string) {
    const next = { ...newCustomer, [key]: value };
    setNewCustomer(next);
    if (key === "city" || key === "province" || key === "barangay") {
      recheckPlaces(chosen[0] ? selected[chosen[0].id].form_details : {}, next);
    }
  }

  /** The four parts of an address a parcel cannot be delivered without. */
  const REQUIRED_DELIVERY: [keyof typeof newCustomer, string][] = [
    ["address_line", "house no. / street / purok"],
    ["barangay", "barangay"],
    ["city", "city or municipality"],
    ["province", "province"],
  ];

  function setField(svcId: string, key: string, value: string) {
    setSelected((prev) => ({
      ...prev,
      [svcId]: {
        ...prev[svcId],
        form_details: { ...prev[svcId].form_details, [key]: value },
        // Staff has reviewed this box — drop the auto-filled highlight.
        autoFilled: prev[svcId].autoFilled.filter((k) => k !== key),
      },
    }));
    const pair = documentPlacePair(
      services.find((s) => s.id === svcId)?.form_fields ?? []
    );
    if (pair && (key === pair.cityKey || key === pair.provinceKey)) {
      const doc = { ...selected[svcId].form_details, [key]: value };
      recheckPlaces(doc, newCustomer, svcId);
    }
  }

  async function autoFill(svcId: string) {
    setError(null);
    setParseNote((n) => ({ ...n, [svcId]: "" }));
    setParsing(svcId);
    try {
      const r = unwrap(
        await parsePastedText(selected[svcId].pasted_details ?? "", svcId)
      );
      applyParsed(svcId, r, "reply");
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setParsing(null);
    }
  }

  /**
   * Put a parse result into the form, whether it came from the pasted reply or
   * from a photo of the document. Never over anything already typed.
   */
  function applyParsed(
    svcId: string,
    r: ParseResult,
    source: "reply" | "photo"
  ) {
    {
      setSelected((prev) => {
        const cur = prev[svcId];
        const details = { ...cur.form_details };
        const filled: string[] = [];
        for (const [k, v] of Object.entries(r.values)) {
          // Never overwrite something a person already typed.
          if (details[k]?.trim()) continue;
          details[k] = v;
          filled.push(k);
        }
        return {
          ...prev,
          [svcId]: {
            ...cur,
            form_details: details,
            autoFilled: filled,
            fieldsOpen: true,
          },
        };
      });
      // The applicant's name and delivery details are in the same reply — save
      // staff typing them twice. Only into fields still empty, never over what
      // they typed.
      //
      // Computed before calling setState rather than counted inside an updater:
      // React runs updaters at render time, so anything counted in there is
      // still zero on the next line.
      // Who to bill and deliver to. Which of the two names in the reply this
      // is — the document's owner or whoever accepts the parcel — is decided
      // in one place, on the server, so the paste and the photo agree.
      const customerName = (r.customer.full_name ?? "").trim();
      let nameFilled = false;
      let deliveryFilled = 0;
      if (mode === "new") {
        const next = { ...newCustomer };
        if (customerName && !next.full_name.trim()) {
          next.full_name = customerName;
          nameFilled = true;
        }
        for (const [k, val] of Object.entries(r.customer)) {
          if (k === "full_name") continue;
          const cur = (next as Record<string, string>)[k];
          if (cur !== undefined && !cur.trim()) {
            (next as Record<string, string>)[k] = val;
            deliveryFilled++;
          }
        }
        if (nameFilled || deliveryFilled > 0) setNewCustomer(next);
        // Open the address block so what was filled is actually seen.
        if (deliveryFilled > 0) setShowAddress(true);
      }

      setPlaces(r.places);

      const n = Object.keys(r.values).length;
      const filled: string[] = [];
      if (n > 0) filled.push(`${n} box${n === 1 ? "" : "es"}`);
      if (nameFilled) filled.push("the customer's name");
      if (deliveryFilled > 0) {
        filled.push(
          `${deliveryFilled} delivery field${deliveryFilled === 1 ? "" : "s"}`
        );
      }
      const listed =
        filled.length > 1
          ? `${filled.slice(0, -1).join(", ")} and ${filled[filled.length - 1]}`
          : filled[0];

      setParseNote((prev) => ({
        ...prev,
        [svcId]:
          filled.length === 0
            ? source === "photo"
              ? "Nothing could be read from that photo — try a clearer shot, or fill the boxes by hand."
              : "Nothing could be read from that reply — fill the boxes by hand."
            : `Filled ${listed}${
                source === "photo"
                  ? " from the photo"
                  : r.tier === 2
                    ? " (AI helped)"
                    : ""
              }. Check them before you create the order.`,
      }));
    }
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
    // A place that doesn't exist means a rejected PSA filing or a returned
    // parcel, so it stops here rather than being saved and discovered later.
    if (places.length > 0 && !placesOk) {
      setError(
        places.length === 1
          ? "Fix the flagged place before creating the order."
          : `Fix the ${places.length} flagged places before creating the order.`
      );
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

    // A parcel needs all four parts of an address. A stub raised before the
    // customer has replied is the one case where they cannot exist yet, so
    // that path is left alone — the details are demanded when they arrive.
    if (initialStatus === "details_received") {
      const from = mode === "new" ? newCustomer : picked;
      const missing = REQUIRED_DELIVERY.filter(
        ([k]) => !String((from as any)?.[k] ?? "").trim()
      ).map(([, label]) => label);
      if (missing.length > 0) {
        setShowAddress(true);
        setError(
          `The delivery address needs the ${missing.join(", ")}. Ask the customer for ${
            missing.length === 1 ? "it" : "them"
          } before creating the order, or save this as a new inquiry for now.`
        );
        return;
      }

      // The document's own required fields, on the same terms. The server
      // refuses either way; catching it here opens the right panel and names
      // the boxes instead of just saying no.
      const gaps = chosen
        .map((s) => ({
          serviceName: s.name,
          serviceId: s.id,
          labels: missingRequiredLabels(
            (s.form_fields ?? []) as FormFieldDef[],
            selected[s.id].form_details
          ),
        }))
        .filter((g) => g.labels.length > 0);
      if (gaps.length > 0) {
        setSelected((prev) => {
          const next = { ...prev };
          for (const g of gaps) {
            if (next[g.serviceId]) {
              next[g.serviceId] = { ...next[g.serviceId], fieldsOpen: true };
            }
          }
          return next;
        });
        setError(
          "Required details are still blank — " +
            gaps
              .map((g) => `${g.serviceName}: ${joinLabels(g.labels)}`)
              .join("; ") +
            ". Fill them in, or save this as a new inquiry until the customer sends them."
        );
        return;
      }
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
              form_details: selected[s.id].form_details,
            })),
          })
        );
        router.push(`/orders/${id}`);
      } catch (e) {
        setError(toMessage(e));
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
                  <Field label="Address line *" className="sm:col-span-2">
                    <Input
                      value={newCustomer.address_line}
                      onChange={(e) => setCust("address_line", e.target.value)}
                    />
                  </Field>
                  <Field label="Barangay *">
                    <Input
                      value={newCustomer.barangay}
                      onChange={(e) => setCust("barangay", e.target.value)}
                    />
                  </Field>
                  <Field label="City / Municipality *">
                    <Input
                      value={newCustomer.city}
                      onChange={(e) => setCust("city", e.target.value)}
                    />
                  </Field>
                  <Field label="Province *">
                    <Input
                      value={newCustomer.province}
                      onChange={(e) => setCust("province", e.target.value)}
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

              {/* Auto-fill reads the paste into the PSA form boxes. It only
                  proposes — the boxes below are what gets saved, so staff can
                  correct anything before the order exists. */}
              {parsingEnabled && (s.form_fields ?? []).length > 0 && (
                <div className="mt-3 space-y-2">
                  <Button
                    type="button"
                    className="bg-[#eda100] font-semibold text-[#3d2f00] shadow-sm hover:bg-[#d99400] disabled:bg-slate-100 disabled:text-slate-400"
                    disabled={
                      parsing === s.id ||
                      !selected[s.id].pasted_details.trim()
                    }
                    onClick={() => autoFill(s.id)}
                  >
                    <Wand2 className="h-4 w-4" />
                    {parsing === s.id
                      ? "Reading…"
                      : PSA_FORMS[s.code]
                        ? "Auto-fill the PSA form from this paste"
                        : "Auto-fill the form from this paste"}
                  </Button>
                  {!selected[s.id].pasted_details.trim() && (
                    <p className="text-xs text-muted-foreground">
                      Paste the customer&apos;s reply above — or read the
                      document from a photo instead.
                    </p>
                  )}

                  {/* The other half of intake: customers who send the
                      certificate itself and fill in nothing. */}
                  <div className="border-t pt-2">
                    <DocumentPhotoScan
                      serviceId={s.id}
                      disabled={parsing === s.id}
                      onParsed={(r) => applyParsed(s.id, r, "photo")}
                    />
                  </div>
                  {parseNote[s.id] && (
                    <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {parseNote[s.id]}
                    </p>
                  )}
                </div>
              )}

              {/* The PSA form boxes. Collapsed by default so intake stays a
                  paste-and-go; auto-fill opens them for review. */}
              {(s.form_fields ?? []).length > 0 && (
                <div className="mt-3 rounded-md border">
                  <button
                    type="button"
                    onClick={() =>
                      setSelected((prev) => ({
                        ...prev,
                        [s.id]: {
                          ...prev[s.id],
                          fieldsOpen: !prev[s.id].fieldsOpen,
                        },
                      }))
                    }
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-accent/40"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${
                          selected[s.id].fieldsOpen ? "" : "-rotate-90"
                        }`}
                      />
                      {/* TIN and PhilHealth are not PSA documents and have no
                          sheet to print; only the wording changes. */}
                      {PSA_FORMS[s.code] ? "PSA form fields" : "Form fields"}
                    </span>
                    <span className="text-muted-foreground">
                      {countFilled(selected[s.id].form_details)} of{" "}
                      {(s.form_fields ?? []).length} filled
                      {countFilled(selected[s.id].form_details) === 0 &&
                        (PSA_FORMS[s.code]
                          ? " — optional now, needed to print"
                          : " — optional now")}
                    </span>
                  </button>

                  {selected[s.id].fieldsOpen && (
                    <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
                      {(s.form_fields ?? []).map((f: FormFieldDef) => {
                        const auto = selected[s.id].autoFilled.includes(f.key);
                        return (
                          <div
                            key={f.key}
                            className={`space-y-1 ${
                              f.type === "textarea" ? "sm:col-span-2" : ""
                            }`}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <Label className="text-xs">
                                {f.required ? `${f.label} *` : f.label}
                              </Label>
                              {auto && (
                                <span className="text-[11px] text-amber-700">
                                  auto-filled — check
                                </span>
                              )}
                            </div>
                            {f.type === "textarea" ? (
                              <Textarea
                                rows={2}
                                className={
                                  auto ? "border-amber-400 bg-amber-50" : ""
                                }
                                value={selected[s.id].form_details[f.key] ?? ""}
                                onChange={(e) =>
                                  setField(s.id, f.key, e.target.value)
                                }
                              />
                            ) : (
                              <Input
                                className={`h-9 ${
                                  auto ? "border-amber-400 bg-amber-50" : ""
                                }`}
                                type={
                                  f.type === "number"
                                    ? "number"
                                    : f.type === "date"
                                      ? "date"
                                      : "text"
                                }
                                value={selected[s.id].form_details[f.key] ?? ""}
                                onChange={(e) =>
                                  setField(s.id, f.key, e.target.value)
                                }
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
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

          {/* One warning per chosen document that carries the rule. */}
          {chosen.map((svc) => (
            <SurnameWarnings
              key={svc.id}
              issues={surnameIssues(
                svc.code,
                selected[svc.id]?.form_details ?? {}
              )}
            />
          ))}

          <PlaceWarnings
            issues={places}
            overridden={placesOk}
            onOverride={setPlacesOk}
            onFix={(i, patch) => {
              if (i.group === "delivery") {
                const next = { ...newCustomer };
                if (patch.city !== undefined) next.city = patch.city;
                if (patch.province !== undefined) next.province = patch.province;
                if (patch.barangay !== undefined) next.barangay = patch.barangay;
                setNewCustomer(next);
                setShowAddress(true);
                recheckPlaces(
                  chosen[0] ? selected[chosen[0].id].form_details : {},
                  next
                );
                return;
              }
              const svc = chosen[0];
              if (!svc) return;
              const pair = documentPlacePair(svc.form_fields ?? []);
              if (!pair) return;
              // Both at once when the fix moves the province out of the city
              // box, so one click doesn't leave the other half wrong.
              const doc = { ...selected[svc.id].form_details };
              if (patch.city !== undefined) doc[pair.cityKey] = patch.city;
              if (patch.province !== undefined) doc[pair.provinceKey] = patch.province;
              setSelected((prev) => ({
                ...prev,
                [svc.id]: {
                  ...prev[svc.id],
                  form_details: doc,
                  autoFilled: prev[svc.id].autoFilled.filter(
                    (k) => k !== pair.cityKey && k !== pair.provinceKey
                  ),
                },
              }));
              recheckPlaces(doc, newCustomer, svc.id);
            }}
          />

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

function countFilled(details: Record<string, string>): number {
  return Object.values(details).filter((v) => v?.trim()).length;
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
