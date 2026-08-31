/** Format a peso amount, e.g. 860 → "₱860.00". */
export function peso(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? Number(amount) : amount ?? 0;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? (n as number) : 0);
}

/**
 * A discount, kept inside what it comes off.
 *
 * Two things can go wrong when someone types a favour into a box: a slipped
 * digit larger than the order, which would otherwise turn a sale into money
 * owed, and stray centavos from a percentage. Both are settled here so the
 * form, the server and the database agree on the figure.
 */
export function clampDiscount(amount: number, subtotal: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const capped = Math.min(amount, Math.max(subtotal, 0));
  return Math.round(capped * 100) / 100;
}

/** "10% off ₱685" as pesos, rounded the way a receipt would. */
export function percentOff(subtotal: number, percent: number): number {
  return clampDiscount((subtotal * percent) / 100, subtotal);
}
