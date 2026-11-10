"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteOrder } from "@/lib/actions/orders";
import { toMessage } from "@/lib/action-result";

/**
 * Removing an order encoded by mistake.
 *
 * Kept away from the status buttons and behind its own heading, because it is
 * not one of them: every other action moves an order along and can be walked
 * back, and this one ends it. The tracking code has to be typed out to arm
 * the button — the mistake this guards against is pressing delete on the
 * order next to the one you meant, and a plain "are you sure?" does nothing
 * about that, since the answer is always yes.
 */
export function DeleteOrder({
  orderId,
  trackingCode,
  customerName,
}: {
  orderId: string;
  trackingCode: string;
  customerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Case and stray spaces are not the thing being checked here.
  const armed = typed.trim().toUpperCase() === trackingCode.toUpperCase();

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await deleteOrder(orderId, reason);
      if (!res.ok) {
        setError(toMessage(res));
        return;
      }
      // The order is gone, so there is no page left to refresh back onto.
      router.push("/orders");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/50 p-4">
        <div>
          <p className="text-sm font-medium text-red-900">Delete this order</p>
          <p className="text-xs text-red-800/80">
            For an order encoded by mistake. It leaves the board and every
            figure. To stop a real order instead, cancel it.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-red-300 text-red-700 hover:bg-red-100"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4">
      <p className="flex items-start gap-2 text-sm font-medium text-red-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          This deletes <strong>{customerName}</strong>&rsquo;s order and
          everything on it — the documents, the encoded details, the history.
          It cannot be undone from here.
        </span>
      </p>

      <div>
        <Label>
          Type <span className="font-mono font-semibold">{trackingCode}</span>{" "}
          to confirm
        </Label>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={trackingCode}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      </div>

      <div>
        <Label>Why? *</Label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="e.g. Encoded twice by mistake — the real one is 4V5Q71MZYY"
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-100 p-2 text-sm text-red-800">{error}</p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={pending || !armed || !reason.trim()}
          onClick={run}
        >
          {pending ? "Deleting…" : "Delete this order for good"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setTyped("");
            setReason("");
            setError(null);
          }}
        >
          Keep it
        </Button>
      </div>
    </div>
  );
}
