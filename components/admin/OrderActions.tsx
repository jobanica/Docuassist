"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, RotateCcw, Ban, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  advanceStatus,
  correctStatusBackward,
  cancelOrder,
} from "@/lib/actions/orders";
import { nextStatus, canCancel, PIPELINE } from "@/lib/status";
import type { OrderStatus, StatusCode } from "@/lib/types";

export function OrderActions({
  orderId,
  status,
  statuses,
}: {
  orderId: string;
  status: StatusCode;
  statuses: OrderStatus[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"advance" | "correct" | "cancel" | null>(
    null
  );
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState<StatusCode | "">("");

  const labelOf = (c: StatusCode) =>
    statuses.find((s) => s.code === c)?.label ?? c;

  const target_ = nextStatus(status);
  const nextIsShipped = target_ === "shipped";
  const earlier = PIPELINE.slice(0, PIPELINE.indexOf(status));

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setPanel(null);
        setNote("");
        setReason("");
        setTarget("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {target_ && !nextIsShipped && (
          <Button
            size="sm"
            onClick={() => setPanel(panel === "advance" ? null : "advance")}
          >
            <ArrowRight className="h-4 w-4" /> Advance to {labelOf(target_)}
          </Button>
        )}
        {nextIsShipped && (
          <Button size="sm" disabled title="Courier details — added in Phase 4">
            <Truck className="h-4 w-4" /> Mark as Shipped (Phase 4)
          </Button>
        )}
        {earlier.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPanel(panel === "correct" ? null : "correct")}
          >
            <RotateCcw className="h-4 w-4" /> Correct status
          </Button>
        )}
        {canCancel(status) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPanel(panel === "cancel" ? null : "cancel")}
          >
            <Ban className="h-4 w-4" /> Cancel
          </Button>
        )}
      </div>

      {panel === "advance" && target_ && (
        <div className="space-y-2 rounded-md border p-3">
          <Label>Optional note</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Received at PSA office"
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => advanceStatus(orderId, note))}
          >
            {pending ? "Saving…" : `Confirm → ${labelOf(target_)}`}
          </Button>
        </div>
      )}

      {panel === "correct" && (
        <div className="space-y-2 rounded-md border p-3">
          <Label>Move back to</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={target}
            onChange={(e) => setTarget(e.target.value as StatusCode)}
          >
            <option value="">Select an earlier stage…</option>
            {earlier.map((c) => (
              <option key={c} value={c}>
                {labelOf(c)}
              </option>
            ))}
          </select>
          <Label>Reason (required)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being corrected?"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !target || !reason.trim()}
            onClick={() =>
              run(() =>
                correctStatusBackward(orderId, target as StatusCode, reason)
              )
            }
          >
            {pending ? "Saving…" : "Confirm correction"}
          </Button>
        </div>
      )}

      {panel === "cancel" && (
        <div className="space-y-2 rounded-md border border-destructive/40 p-3">
          <Label>Cancellation reason (required)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer changed their mind"
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || !reason.trim()}
            onClick={() => run(() => cancelOrder(orderId, reason))}
          >
            {pending ? "Cancelling…" : "Confirm cancellation"}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
