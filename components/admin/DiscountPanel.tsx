"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Tag, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toMessage, unwrap } from "@/lib/action-result";
import { setOrderDiscount } from "@/lib/actions/orders";
import { clampDiscount, percentOff, peso } from "@/lib/money";

/** Quick taps, because a discount is nearly always one of these. */
const QUICK = [5, 10, 15];

/**
 * The favour done for a regular, as its own figure.
 *
 * Kept separate from the price of the document on purpose: editing the price
 * would say a PSA birth certificate costs ₱585 on this order, and the
 * per-service report would then never agree with itself. Here the document
 * still costs what it costs, and the discount is a line under it with a reason
 * beside it.
 */
export function DiscountPanel({
  orderId,
  subtotal,
  discount,
  reason,
  total,
  /** Closed orders keep their figures — money already settled isn't rewritten. */
  editable,
}: {
  orderId: string;
  subtotal: number;
  discount: number;
  reason: string | null;
  total: number;
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(discount > 0 ? String(discount) : "");
  const [why, setWhy] = useState(reason ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const typed = clampDiscount(Number(amount), subtotal);
  const preview = subtotal - typed;
  // A figure bigger than the order is a slipped digit, not a free document.
  // Clamping it quietly would show ₱0.00 as though that were the intention.
  const tooBig = Number(amount) > subtotal;

  function save(next: number, nextReason: string) {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await setOrderDiscount(orderId, next, nextReason));
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  // Nothing given, nothing to show but the way to give one — the card's own
  // heading already carries the total.
  if (!open) {
    return (
      <div className="space-y-1.5 border-t pt-3 text-sm">
        {discount > 0 && (
          <>
            <Row label="Subtotal" value={peso(subtotal)} muted />
            <Row
              label={
                <span className="inline-flex items-center gap-1.5 text-emerald-700">
                  <Tag className="h-3.5 w-3.5" />
                  Discount
                  {reason && (
                    <span className="font-normal text-muted-foreground">
                      · {reason}
                    </span>
                  )}
                </span>
              }
              value={<span className="text-emerald-700">− {peso(discount)}</span>}
            />
            <Row
              label={<span className="font-semibold">Total</span>}
              value={<span className="font-semibold">{peso(total)}</span>}
            />
          </>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent/40"
          >
            <Tag className="h-3.5 w-3.5" />
            {discount > 0 ? "Change the discount" : "Give a discount"}
          </button>
        )}
        {error && <Err msg={error} />}
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-sm font-semibold">Discount on {peso(subtotal)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            ₱
          </span>
          <Input
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0"
            className="h-9 w-28 pl-6"
          />
        </div>
        {QUICK.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(String(percentOff(subtotal, p)))}
            className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/40"
          >
            {p}%
          </button>
        ))}
        {discount > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => save(0, "")}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>

      <Input
        value={why}
        maxLength={200}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="Why — e.g. suki since 2024, third document this month"
        className="h-9 text-sm"
      />

      {tooBig ? (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          That is more than the order itself ({peso(subtotal)}). Check the
          figure — a discount can take the total to zero, but no further.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {typed > 0 ? (
            <>
              The customer pays{" "}
              <span className="font-semibold">{peso(preview)}</span> instead of{" "}
              {peso(subtotal)}. This is what they see on their tracking page and
              what the COD reminder asks for — the reason stays on our side.
            </>
          ) : (
            <>Type an amount, or tap one of the percentages.</>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending || tooBig}
          onClick={() => save(typed, why)}
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" /> Save
            </>
          )}
        </Button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setAmount(discount > 0 ? String(discount) : "");
            setWhy(reason ?? "");
            setError(null);
          }}
          className="rounded-md px-2 py-1.5 text-xs hover:bg-accent/40"
        >
          Cancel
        </button>
      </div>
      {error && <Err msg={error} />}
    </div>
  );
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className={muted ? "text-muted-foreground" : ""}>{value}</span>
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {msg}
    </p>
  );
}
