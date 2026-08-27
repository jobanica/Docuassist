import { formatInTimeZone } from "date-fns-tz";

export const MANILA_TZ = "Asia/Manila";

/** "Sep 10, 2026" in Asia/Manila. */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return formatInTimeZone(new Date(value), MANILA_TZ, "MMM d, yyyy");
  } catch {
    return "—";
  }
}

/** "Sep 10, 2026 · 3:04 PM" in Asia/Manila. */
export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return formatInTimeZone(new Date(value), MANILA_TZ, "MMM d, yyyy · h:mm a");
  } catch {
    return "—";
  }
}

/** Short "~Sep 10" form used for estimated dates on the public page. */
export function fmtEstimate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return "~" + formatInTimeZone(new Date(value), MANILA_TZ, "MMM d");
  } catch {
    return "—";
  }
}

/** Whole days elapsed since `value` (UTC-safe, calendar-agnostic). */
export function daysSince(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/** Add `days` to a base date, returning a YYYY-MM-DD string (date only). */
export function addDaysISO(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
