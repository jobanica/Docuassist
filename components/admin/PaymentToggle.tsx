"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPaymentStatus } from "@/lib/actions/orders";
import { peso } from "@/lib/money";

/** COD payment toggle, shown on delivered orders (§8). */
export function PaymentToggle({
  orderId,
  paid,
  totalAmount,
}: {
  orderId: string;
  paid: boolean;
  totalAmount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await setPaymentStatus(orderId, next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update payment.");
      }
    });
  }

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={paid}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>
          COD collected — {peso(totalAmount)}
          {!paid && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Unpaid
            </span>
          )}
        </span>
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
