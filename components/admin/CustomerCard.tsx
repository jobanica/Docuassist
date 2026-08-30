"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, X, Wand2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { unwrap } from "@/lib/action-result";
import { updateCustomer } from "@/lib/actions/customers";
import { parsePastedText } from "@/lib/actions/parse";
import type { Customer } from "@/lib/types";

const FIELDS: { key: keyof Customer; label: string; wide?: boolean }[] = [
  { key: "full_name", label: "Full name", wide: true },
  { key: "phone", label: "Mobile number" },
  { key: "messenger_name", label: "Messenger name" },
  { key: "messenger_link", label: "Messenger link", wide: true },
  { key: "address_line", label: "Address line", wide: true },
  { key: "barangay", label: "Barangay" },
  { key: "city", label: "City / Municipality" },
  { key: "province", label: "Province" },
  { key: "zip", label: "ZIP" },
];

/**
 * Customer and delivery details on the order.
 *
 * Editable in place, because the address usually arrives after the order does
 * — the customer sends it in a later message — and re-encoding the whole order
 * to fix a digit in a phone number is absurd. Auto-fill reads the same pasted
 * reply the document fields come from.
 */
export function CustomerCard({
  customer,
  orderId,
  parseSource,
  parsingEnabled,
}: {
  customer: Customer;
  orderId: string;
  /** The order's pasted reply + which service it belongs to, for auto-fill. */
  parseSource: { text: string; serviceId: string } | null;
  parsingEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState<string[]>([]);
  const [v, setV] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, (customer as any)[f.key] ?? ""]))
  );

  const address =
    [customer.address_line, customer.barangay, customer.city, customer.province, customer.zip]
      .filter(Boolean)
      .join(", ") || null;

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await updateCustomer(customer.id, v as any));
        setEditing(false);
        setAuto([]);
        setNote(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  async function autoFill() {
    if (!parseSource) return;
    setError(null);
    setNote(null);
    setParsing(true);
    try {
      const r = unwrap(
        await parsePastedText(parseSource.text, parseSource.serviceId, orderId)
      );
      const filled: string[] = [];
      setV((prev) => {
        const next = { ...prev };
        for (const [k, val] of Object.entries(r.customer)) {
          if (next[k]?.trim()) continue; // never overwrite what is already there
          next[k] = val;
          filled.push(k);
        }
        return next;
      });
      setAuto(filled);
      setEditing(true);
      setNote(
        filled.length === 0
          ? "No delivery details found in the reply — the customer may not have sent them yet."
          : `Filled ${filled.length} field${filled.length === 1 ? "" : "s"}${
              r.tier === 2 ? " (AI helped)" : ""
            }. Check them, then Save.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that reply.");
    } finally {
      setParsing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Customer</CardTitle>
        <div className="flex gap-2">
          {parsingEnabled && parseSource && !editing && (
            <Button
              size="sm"
              className="bg-[#eda100] font-semibold text-[#3d2f00] shadow-sm hover:bg-[#d99400] disabled:bg-slate-100 disabled:text-slate-400"
              disabled={parsing || pending}
              onClick={autoFill}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {parsing ? "Reading…" : "Auto-fill from the reply"}
            </Button>
          )}
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {note && (
          <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {note}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {editing ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div
                  key={f.key}
                  className={`space-y-1 ${f.wide ? "sm:col-span-2" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <Label className="text-xs">{f.label}</Label>
                    {auto.includes(f.key as string) && (
                      <span className="text-[11px] text-amber-700">
                        auto-filled — check
                      </span>
                    )}
                  </div>
                  <Input
                    className={`h-9 ${
                      auto.includes(f.key as string)
                        ? "border-amber-400 bg-amber-50"
                        : ""
                    }`}
                    value={v[f.key as string] ?? ""}
                    onChange={(e) => {
                      setV({ ...v, [f.key]: e.target.value });
                      setAuto((a) => a.filter((k) => k !== f.key));
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={save}>
                <Save className="h-3.5 w-3.5" />
                {pending ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setV(
                    Object.fromEntries(
                      FIELDS.map((f) => [f.key, (customer as any)[f.key] ?? ""])
                    )
                  );
                  setAuto([]);
                  setNote(null);
                  setEditing(false);
                }}
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
            </div>
          </>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Info label="Phone" value={customer.phone} />
            <Info label="Messenger" value={customer.messenger_name} />
            <Info label="Address" value={address} full />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Info({
  label,
  value,
  full,
}: {
  label: string;
  value: string | null | undefined;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}
