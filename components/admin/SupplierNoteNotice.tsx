"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Check,
  Undo2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toMessage, unwrap } from "@/lib/action-result";
import { fmtDateTime } from "@/lib/dates";
import {
  resolveSupplierNote,
  reopenSupplierNote,
  type SupplierNote,
} from "@/lib/actions/supplier";

/**
 * What the supplier flagged, shown to the office.
 *
 * A missing detail on a TIN or PhilHealth job the supplier could not file. It
 * is not the customer's business — it never appears on the tracking page — so
 * it lives here, above the order's contents, where the staff who chase these
 * documents will see it. Marking it handled keeps the record but clears the
 * board flag.
 */
export function SupplierNoteNotice({ notes }: { notes: SupplierNote[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (notes.length === 0) return null;

  const open = notes.filter((n) => !n.addressed_at);

  function act(id: string, fn: (id: string) => Promise<unknown>) {
    setError(null);
    setBusy(id);
    startTransition(async () => {
      try {
        unwrap((await fn(id)) as any);
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="rounded-xl border border-[#2a78d6]/30 bg-[#2a78d6]/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#1e3a5f]">
        <MessageSquare className="h-4 w-4" />
        {open.length > 0
          ? `The supplier flagged ${open.length} thing${open.length === 1 ? "" : "s"} on this job`
          : "Supplier notes"}
      </p>
      <ul className="mt-2 space-y-2">
        {notes.map((n) => (
          <li
            key={n.id}
            className={`rounded-lg border p-2.5 text-sm ${
              n.addressed_at
                ? "border-slate-200 bg-white/60 text-slate-500"
                : "border-[#2a78d6]/20 bg-white text-slate-800"
            }`}
          >
            <p className="whitespace-pre-wrap">{n.body}</p>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">
                {n.author_name ? `${n.author_name} · ` : ""}
                {fmtDateTime(n.created_at)}
                {n.addressed_at && (
                  <>
                    {" · handled"}
                    {n.addressed_by_name ? ` by ${n.addressed_by_name}` : ""}
                  </>
                )}
              </span>
              {n.addressed_at ? (
                <button
                  type="button"
                  disabled={busy === n.id}
                  onClick={() => act(n.id, reopenSupplierNote)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 disabled:opacity-60"
                >
                  {busy === n.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Undo2 className="h-3 w-3" />
                  )}
                  Re-open
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy === n.id}
                  onClick={() => act(n.id, resolveSupplierNote)}
                  className="inline-flex items-center gap-1 rounded-md border border-[#2a78d6]/30 bg-white px-2 py-1 text-[11px] font-medium text-[#2a78d6] hover:bg-[#2a78d6]/10 disabled:opacity-60"
                >
                  {busy === n.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Mark handled
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-[#1e3a5f]/70">
        The customer never sees these. Message them the missing detail, then
        mark it handled.
      </p>
      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
