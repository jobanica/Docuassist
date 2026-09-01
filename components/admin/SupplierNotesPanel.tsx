"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquarePlus,
  Loader2,
  AlertCircle,
  Check,
  Clock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toMessage, unwrap } from "@/lib/action-result";
import { addSupplierNote, type SupplierNote } from "@/lib/actions/supplier";
import { fmtDateTime } from "@/lib/dates";

const MAX = 1000;

/**
 * The supplier telling the office a job is short a detail.
 *
 * Not a delay — that speaks to the customer. This speaks to the staff who
 * handle these documents: "walang birthdate", "the ID photo is unreadable".
 * The supplier sees their own notes and whether the office has picked each
 * one up, so they know whether to chase or wait.
 */
export function SupplierNotesPanel({
  orderId,
  notes,
}: {
  orderId: string;
  notes: SupplierNote[];
}) {
  const router = useRouter();
  const [list, setList] = useState<SupplierNote[]>(notes);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const openCount = list.filter((n) => !n.addressed_at).length;

  function send() {
    setError(null);
    startTransition(async () => {
      try {
        const saved = unwrap(await addSupplierNote(orderId, text));
        setList((prev) => [...prev, saved]);
        setText("");
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  return (
    <div className="mt-3">
      {list.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {list.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs"
            >
              <p className="whitespace-pre-wrap text-slate-800">{n.body}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                {n.addressed_at ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    Seen by the office
                  </>
                ) : (
                  <>
                    <Clock className="h-3 w-3 text-amber-500" />
                    Sent {fmtDateTime(n.created_at)} · waiting for the office
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#2a78d6]/40 px-2.5 py-1.5 text-xs font-medium text-[#2a78d6] hover:bg-[#2a78d6]/5"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          {list.length > 0 ? "Add another note" : "Note the office"}
        </button>
      ) : (
        <div className="rounded-lg border border-[#2a78d6]/30 bg-[#2a78d6]/5 p-2.5">
          <label className="text-xs font-semibold text-[#1e3a5f]">
            What's missing or wrong?
          </label>
          <p className="mb-1.5 mt-0.5 text-[11px] text-slate-600">
            This goes to the office, not the customer.
          </p>
          <Textarea
            autoFocus
            rows={3}
            maxLength={MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Walang birthdate. Or: the ID photo is too blurry to read the middle name."
            className="bg-white text-sm"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <Button size="sm" disabled={pending || !text.trim()} onClick={send}>
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <MessageSquarePlus className="h-3.5 w-3.5" /> Send to office
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setText("");
                setError(null);
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
          {error && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
      )}
      {openCount > 0 && !open && (
        <p className="mt-1 text-[11px] text-amber-600">
          {openCount} note{openCount === 1 ? "" : "s"} still waiting for the
          office.
        </p>
      )}
    </div>
  );
}
