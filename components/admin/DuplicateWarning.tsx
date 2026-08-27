"use client";

import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/dates";
import { StatusBadge } from "./StatusBadge";
import type { DuplicateMatch } from "@/lib/actions/duplicates";

/**
 * Shown when intake finds an existing order for the same person. It warns and
 * gets out of the way — a second copy of the same document is a real thing
 * customers ask for, and only the staff member reading the thread can tell a
 * genuine repeat from an accidental one.
 */
export function DuplicateWarning({
  matches,
  pending,
  onProceed,
  onCancel,
}: {
  matches: DuplicateMatch[];
  pending: boolean;
  onProceed: () => void;
  onCancel: () => void;
}) {
  const strong = matches.filter((m) => m.severity === "strong");
  const headline =
    strong.length > 0
      ? `This customer already has an order for the same document.`
      : `This customer already has a recent order.`;

  return (
    <div
      className={`rounded-2xl border p-4 ${
        strong.length > 0
          ? "border-red-300 bg-red-50"
          : "border-amber-300 bg-amber-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 h-5 w-5 shrink-0 ${
            strong.length > 0 ? "text-red-600" : "text-amber-600"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p
            className={`font-semibold ${
              strong.length > 0 ? "text-red-900" : "text-amber-900"
            }`}
          >
            {headline}
          </p>
          <p
            className={`mt-0.5 text-xs ${
              strong.length > 0 ? "text-red-800" : "text-amber-800"
            }`}
          >
            Check the thread before you continue — encoding it twice means
            paying PSA twice and shipping twice. If they really are asking for
            another copy, go ahead.
          </p>

          <ul className="mt-3 space-y-2">
            {matches.map((m) => (
              <li
                key={m.order_id}
                className="rounded-lg bg-white p-3 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {m.customer_name}
                  </span>
                  <StatusBadge code={m.status} label={m.status_label} />
                  {m.severity === "strong" && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                      Same document
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    {fmtDate(m.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {m.service_names.join(", ") || "no documents"}
                  {m.customer_phone && ` · ${m.customer_phone}`}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Matched on {m.matched_on.join(" and ") || "this customer"} ·{" "}
                  <span className="font-mono">{m.tracking_code}</span>
                </p>
                <Link
                  href={`/orders/${m.order_id}`}
                  target="_blank"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[#2a78d6] hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Open this order
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={onCancel} disabled={pending}>
              Go back
            </Button>
            <Button
              onClick={onProceed}
              disabled={pending}
              className={
                strong.length > 0
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : undefined
              }
            >
              {pending ? "Creating…" : "Create anyway"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
