"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  RotateCcw,
  Ban,
  Truck,
  PackageCheck,
  PackageX,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { unwrap, type ActionResult } from "@/lib/action-result";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  advanceStatus,
  correctStatusBackward,
  cancelOrder,
  markShipped,
  logFailedAttempt,
  markDelivered,
  markReturned,
} from "@/lib/actions/orders";
import {
  nextStatus,
  canCancel,
  PIPELINE,
  FAILED_ATTEMPT_REASONS,
} from "@/lib/status";
import { peso } from "@/lib/money";
import type { Courier, OrderStatus, StatusCode } from "@/lib/types";

type Panel =
  | "advance"
  | "correct"
  | "cancel"
  | "ship"
  | "attempt"
  | "deliver"
  | "return"
  | null;

export function OrderActions({
  orderId,
  status,
  statuses,
  couriers,
  deliveryAttempts,
  totalAmount,
}: {
  orderId: string;
  status: StatusCode;
  statuses: OrderStatus[];
  couriers: Courier[];
  deliveryAttempts: number;
  totalAmount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);

  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState<StatusCode | "">("");

  // Shipping
  const [courierId, setCourierId] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  // Failed attempt
  const [attemptReason, setAttemptReason] = useState(FAILED_ATTEMPT_REASONS[0]);
  const [attemptOther, setAttemptOther] = useState("");

  // Delivery
  const [codCollected, setCodCollected] = useState(true);

  const labelOf = (c: StatusCode) =>
    statuses.find((s) => s.code === c)?.label ?? c;

  const upcoming = nextStatus(status);
  const earlier = PIPELINE.slice(0, PIPELINE.indexOf(status));
  const atMax = deliveryAttempts >= 3;

  function toggle(p: Panel) {
    setError(null);
    setPanel(panel === p ? null : p);
  }

  function run(fn: () => Promise<ActionResult<unknown>>) {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await fn());
        setPanel(null);
        setNote("");
        setReason("");
        setTarget("");
        setAttemptOther("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {/* Plain forward advance (up to released) */}
        {upcoming && upcoming !== "shipped" && upcoming !== "delivered" && (
          <Button size="sm" onClick={() => toggle("advance")}>
            <ArrowRight className="h-4 w-4" /> Advance to {labelOf(upcoming)}
          </Button>
        )}

        {/* released → shipped */}
        {status === "released" && (
          <Button size="sm" onClick={() => toggle("ship")}>
            <Truck className="h-4 w-4" /> Mark as Shipped
          </Button>
        )}

        {/* shipped: attempts / delivered / returned */}
        {status === "shipped" && (
          <>
            <Button size="sm" onClick={() => toggle("deliver")}>
              <PackageCheck className="h-4 w-4" /> Mark as Delivered
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={atMax}
              title={atMax ? "3 attempts already logged" : undefined}
              onClick={() => toggle("attempt")}
            >
              <AlertTriangle className="h-4 w-4" /> Log failed attempt
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toggle("return")}
            >
              <PackageX className="h-4 w-4" /> Mark as Returned
            </Button>
          </>
        )}

        {earlier.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => toggle("correct")}>
            <RotateCcw className="h-4 w-4" /> Correct status
          </Button>
        )}
        {canCancel(status) && (
          <Button size="sm" variant="outline" onClick={() => toggle("cancel")}>
            <Ban className="h-4 w-4" /> Cancel
          </Button>
        )}
      </div>

      {atMax && status === "shipped" && (
        <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">
          3 of 3 delivery attempts failed. The courier will return this parcel —
          mark it as Returned once it&apos;s back.
        </p>
      )}

      {/* --- Advance --- */}
      {panel === "advance" && upcoming && (
        <Box>
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
            {pending ? "Saving…" : `Confirm → ${labelOf(upcoming)}`}
          </Button>
        </Box>
      )}

      {/* --- Ship --- */}
      {panel === "ship" && (
        <Box>
          <Label>Courier</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={courierId}
            onChange={(e) => setCourierId(e.target.value)}
          >
            <option value="">Select a courier…</option>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Label>Courier tracking number</Label>
          <Input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="e.g. 620123456789"
          />
          <p className="text-xs text-muted-foreground">
            The courier&apos;s tracking page URL comes from settings — the
            customer copies this number and pastes it there.
          </p>
          <Button
            size="sm"
            disabled={pending || !courierId || !trackingNumber.trim()}
            onClick={() =>
              run(() => markShipped(orderId, courierId, trackingNumber, note))
            }
          >
            {pending ? "Saving…" : "Confirm shipment"}
          </Button>
        </Box>
      )}

      {/* --- Failed attempt --- */}
      {panel === "attempt" && (
        <Box>
          <Label>Reason for the failed attempt</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={attemptReason}
            onChange={(e) => setAttemptReason(e.target.value)}
          >
            {FAILED_ATTEMPT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="__other">Other…</option>
          </select>
          {attemptReason === "__other" && (
            <Input
              value={attemptOther}
              onChange={(e) => setAttemptOther(e.target.value)}
              placeholder="Describe what happened"
            />
          )}
          <p className="text-xs text-muted-foreground">
            This will be attempt {deliveryAttempts + 1} of 3. An SMS nudge to the
            customer is wired up in Phase 6.
          </p>
          <Button
            size="sm"
            disabled={
              pending ||
              (attemptReason === "__other" && !attemptOther.trim())
            }
            onClick={() =>
              run(() =>
                logFailedAttempt(
                  orderId,
                  attemptReason === "__other" ? attemptOther : attemptReason
                )
              )
            }
          >
            {pending ? "Saving…" : `Log attempt ${deliveryAttempts + 1}/3`}
          </Button>
        </Box>
      )}

      {/* --- Deliver --- */}
      {panel === "deliver" && (
        <Box>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={codCollected}
              onChange={(e) => setCodCollected(e.target.checked)}
            />
            COD collected — {peso(totalAmount)} received
          </label>
          <Label>Optional note</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Received by the customer's mother"
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => markDelivered(orderId, codCollected, note))}
          >
            {pending ? "Saving…" : "Confirm delivery"}
          </Button>
        </Box>
      )}

      {/* --- Returned --- */}
      {panel === "return" && (
        <Box tone="destructive">
          <Label>Return reason (required)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. 3 failed attempts — customer unreachable"
          />
          <p className="text-xs text-muted-foreground">
            This records a lost sale: {peso(totalAmount)} comes off booked sales
            as an RTS loss.
          </p>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || !reason.trim()}
            onClick={() => run(() => markReturned(orderId, reason))}
          >
            {pending ? "Saving…" : "Confirm return to sender"}
          </Button>
        </Box>
      )}

      {/* --- Correct --- */}
      {panel === "correct" && (
        <Box>
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
        </Box>
      )}

      {/* --- Cancel --- */}
      {panel === "cancel" && (
        <Box tone="destructive">
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
        </Box>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Box({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "destructive";
}) {
  return (
    <div
      className={`space-y-2 rounded-md border p-3 ${
        tone === "destructive" ? "border-destructive/40" : ""
      }`}
    >
      {children}
    </div>
  );
}
