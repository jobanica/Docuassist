import type { StatusCode } from "./types";
import { daysSince } from "./dates";

/** The forward pipeline (excludes terminal cancelled/returned). §4 */
export const PIPELINE: StatusCode[] = [
  "new_inquiry",
  "details_received",
  "processing",
  "released",
  "shipped",
  "delivered",
];

export const TERMINAL: StatusCode[] = ["delivered", "cancelled", "returned"];

/** Next status in the pipeline, or null if there is none / status is terminal. */
export function nextStatus(code: StatusCode): StatusCode | null {
  const i = PIPELINE.indexOf(code);
  if (i === -1 || i === PIPELINE.length - 1) return null;
  return PIPELINE[i + 1];
}

/** Cancel is allowed from any stage before shipped (and not already terminal). §4 */
export function canCancel(code: StatusCode): boolean {
  const i = PIPELINE.indexOf(code);
  return i !== -1 && i < PIPELINE.indexOf("shipped");
}

export type Aging = "none" | "warn" | "alert";

/**
 * A week with the supplier is worth a look; a fortnight is somebody chasing
 * it. Those two thresholds are the ones the office and the supplier both work
 * to, so they live here and nowhere else — a job the supplier sees as fine and
 * the board shows in red would be worse than no colour at all.
 */
export const PROCESSING_WARN_DAYS = 7;
export const PROCESSING_ALERT_DAYS = 14;

/**
 * Aging highlight for the orders board. Only active (non-terminal) stages age;
 * `processing` is the one that leaves the office's hands, so it is the one
 * with the agreed thresholds — the others keep a softer nudge.
 */
export function aging(code: StatusCode, statusSince: string): Aging {
  if (TERMINAL.includes(code) || code === "cancelled" || code === "returned") {
    return "none";
  }
  const days = daysSince(statusSince);
  const alertAt = code === "processing" ? PROCESSING_ALERT_DAYS : 10;
  const warnAt = code === "processing" ? PROCESSING_WARN_DAYS : 6;
  if (days >= alertAt) return "alert";
  if (days >= warnAt) return "warn";
  return "none";
}

/** Tailwind classes for a small ageing pill, for lists that are not the board. */
export const agingPill: Record<Aging, string> = {
  none: "bg-slate-100 text-slate-600",
  warn: "bg-amber-100 text-amber-800",
  alert: "bg-red-100 text-red-700",
};

/** "3 days", "2 weeks" — short enough to sit beside a name. */
export function ageLabel(statusSince: string | null | undefined): string {
  const d = daysSince(statusSince);
  if (d <= 0) return "today";
  if (d === 1) return "1 day";
  if (d < 14) return `${d} days`;
  return `${Math.floor(d / 7)} weeks`;
}

/** Tailwind classes for a status badge, keyed by status code. */
export function statusBadgeClasses(code: StatusCode): string {
  switch (code) {
    case "new_inquiry":
      return "bg-slate-100 text-slate-700";
    case "details_received":
      return "bg-sky-100 text-sky-700";
    case "processing":
      return "bg-amber-100 text-amber-800";
    case "released":
      return "bg-violet-100 text-violet-700";
    case "shipped":
      return "bg-blue-100 text-blue-700";
    case "delivered":
      return "bg-emerald-100 text-emerald-700";
    case "cancelled":
      return "bg-gray-200 text-gray-600";
    case "returned":
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

/** Badge styling for delivery attempts: 1/3 neutral, 2/3 amber, 3/3 red. §4 */
export function attemptBadgeClasses(attempts: number): string {
  if (attempts >= 3) return "bg-red-100 text-red-700";
  if (attempts === 2) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

/** Common failed-delivery reasons offered to staff (§4). */
export const FAILED_ATTEMPT_REASONS = [
  "No one home",
  "Wrong address",
  "Refused / cancelled by customer",
  "Customer unreachable",
  "No cash for COD",
  "Rescheduled by customer",
];
