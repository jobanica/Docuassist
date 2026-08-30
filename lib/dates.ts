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

/** Any timestamp as its Manila calendar date, YYYY-MM-DD. Slicing the raw
 *  string instead would give the UTC date, which is a day early for anything
 *  recorded after 4pm here. */
export function dateOnlyManila(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  try {
    return formatInTimeZone(new Date(value), MANILA_TZ, "yyyy-MM-dd");
  } catch {
    return null;
  }
}

/** Today's calendar date in Manila, as YYYY-MM-DD. */
export function todayManila(): string {
  return formatInTimeZone(new Date(), MANILA_TZ, "yyyy-MM-dd");
}

/**
 * Whole calendar days from today in Manila to a date-only value. Negative when
 * the date has passed. Calendar days, not elapsed hours: a customer reading
 * "tomorrow" means the next date on the wall, whatever time it is now.
 */
export function daysUntilManila(dateOnly: string | null | undefined): number | null {
  if (!dateOnly) return null;
  const target = String(dateOnly).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
  const a = Date.parse(`${todayManila()}T00:00:00Z`);
  const b = Date.parse(`${target}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** "Wednesday" in Manila, for the line under a big date. */
export function fmtWeekday(value: string | Date | null | undefined): string {
  if (!value) return "";
  try {
    const v = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00+08:00`
      : value;
    return formatInTimeZone(new Date(v), MANILA_TZ, "EEEE");
  } catch {
    return "";
  }
}
