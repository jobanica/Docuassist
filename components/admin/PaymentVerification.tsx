"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  FileText,
  Loader2,
  ExternalLink,
  Trash2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toMessage, unwrap } from "@/lib/action-result";
import { peso } from "@/lib/money";
import { fmtDateTime } from "@/lib/dates";
import {
  receiptUrl,
  verifyPayment,
  rejectPayment,
  deleteReceipt,
  type Receipt,
} from "@/lib/actions/payments";

/**
 * Checking the money before the work starts.
 *
 * A prepaid order arrives with the customer's word that they paid and, usually,
 * a screenshot. Neither marks it paid — somebody has to look. This is that
 * look: the receipts, and the two answers, with the reason for a no going back
 * to the customer's tracking page because they are the only one who can fix it.
 */
export function PaymentVerification({
  orderId,
  receipts,
  paid,
  totalAmount,
  submittedAt,
  verifiedAt,
  verifiedByName,
  rejectedReason,
}: {
  orderId: string;
  receipts: Receipt[];
  paid: boolean;
  totalAmount: number;
  submittedAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  rejectedReason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  // Nothing to show on an order nobody has claimed to have paid for — a COD
  // order is settled at the door, and that toggle lives elsewhere.
  if (!submittedAt && receipts.length === 0 && !paid) return null;

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        unwrap((await fn()) as never);
        setRejecting(false);
        setReason("");
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  async function open(id: string) {
    setError(null);
    setOpening(id);
    try {
      const url = unwrap(await receiptUrl(id));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setOpening(null);
    }
  }

  const waiting = Boolean(submittedAt) && !paid;

  return (
    <div
      className={`rounded-2xl border p-5 ${
        paid
          ? "border-emerald-200 bg-emerald-50/50"
          : waiting
            ? "border-amber-300 bg-amber-50/60"
            : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            {paid ? (
              <BadgeCheck className="h-4 w-4 text-emerald-600" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-amber-600" />
            )}
            Payment
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {paid
              ? `Verified${verifiedByName ? ` by ${verifiedByName}` : ""}${
                  verifiedAt ? ` · ${fmtDateTime(verifiedAt)}` : ""
                }`
              : waiting
                ? `Customer says they paid · ${fmtDateTime(submittedAt!)}`
                : "Not yet submitted"}
          </p>
        </div>
        <span className="shrink-0 text-lg font-bold text-slate-900">
          {peso(totalAmount)}
        </span>
      </div>

      {rejectedReason && !paid && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Turned down: {rejectedReason} — the customer sees this on their
          tracking page.
        </p>
      )}

      {receipts.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {receipts.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
                {r.file_name}
                <span className="ml-1.5 text-slate-400">
                  {fmtDateTime(r.created_at)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => open(r.id)}
                disabled={opening === r.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#1E86C7] hover:bg-slate-100"
              >
                {opening === r.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                View
              </button>
              <button
                type="button"
                onClick={() => run(() => deleteReceipt(r.id, orderId))}
                disabled={pending}
                title="Remove this file"
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg bg-white/70 p-2.5 text-xs text-slate-500">
          No receipt attached. The customer may have sent it on Messenger
          instead — check there before turning it down.
        </p>
      )}

      {!paid && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => verifyPayment(orderId))}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BadgeCheck className="h-4 w-4" />
            )}
            Verify payment
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setRejecting((v) => !v)}
          >
            Not accepted
          </Button>
        </div>
      )}

      {rejecting && (
        <div className="mt-3 space-y-2 rounded-lg border border-destructive/40 p-3">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              paid
                ? "Why is this being un-verified?"
                : "e.g. The amount sent is ₱300, short by ₱65."
            }
          />
          <p className="text-xs text-muted-foreground">
            The customer reads this on their tracking page, so write it to them.
          </p>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || !reason.trim()}
            onClick={() => run(() => rejectPayment(orderId, reason))}
          >
            {pending ? "Saving…" : paid ? "Mark unpaid" : "Send this back"}
          </Button>
        </div>
      )}

      {paid && (
        <Button
          size="sm"
          variant="outline"
          className="mt-4"
          disabled={pending}
          onClick={() => setRejecting((v) => !v)}
        >
          Undo — mark unpaid
        </Button>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
