import { peso } from "./money";
import type { TrackingInfo } from "./tracking";

/** Replace {token} placeholders; unknown/empty tokens collapse cleanly. */
export function interpolate(
  template: string,
  values: Record<string, string | null | undefined>
): string {
  return template
    .replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")
    // tidy artifacts left when a token was empty (e.g. "via !" / double spaces)
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.!?,])/g, "$1")
    .trim();
}

function tokens(info: TrackingInfo): Record<string, string> {
  return {
    name: info.first_name ?? "",
    courier: info.courier?.name ?? "",
    number: info.courier?.tracking_number ?? "",
    total: peso(info.total_amount),
    n: String(info.delivery_attempts),
  };
}

/** The main helper line for the current status. */
export function statusHelper(info: TrackingInfo): string {
  if (!info.public_helper) return "";
  return interpolate(info.public_helper, tokens(info));
}

/** Most recent failed-attempt reason from history, if any. */
export function latestFailedReason(info: TrackingInfo): string | null {
  const attempts = info.history.filter((h) => h.event_type === "failed_attempt");
  const last = attempts[attempts.length - 1];
  return last?.note ?? null;
}

export interface AttemptNotice {
  text: string;
  strong: boolean; // attempts >= 2 → prominent RTS warning
}

/**
 * Failed-attempt notice for the public page (§7). Shown while shipped with at
 * least one failed attempt. Escalates at attempts 2–3.
 */
export function attemptNotice(info: TrackingInfo): AttemptNotice | null {
  if (info.status !== "shipped" || info.delivery_attempts <= 0) return null;
  const n = info.delivery_attempts;
  const reason = latestFailedReason(info);
  const total = peso(info.total_amount);
  let text = `Delivery attempt ${n} of 3 was unsuccessful${
    reason ? ` (${reason})` : ""
  }. The courier will try again — please keep your phone reachable and prepare ${total} COD.`;
  const strong = n >= 2;
  if (strong) {
    text += " After 3 failed attempts, your parcel will be returned to sender.";
  }
  return { text, strong };
}

/**
 * Colour for the big status badge on the tracking page.
 *
 * Keyed to the same meaning the rest of the page uses — green for arrived, red
 * for gone wrong, blue for on the move — so a customer glancing at the badge,
 * the stepper and the arrival card is not reading three different stories.
 */
export function statusPillClasses(code: string): string {
  switch (code) {
    case "delivered":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "shipped":
      return "bg-blue-50 text-blue-700 ring-blue-100";
    case "released":
      return "bg-violet-50 text-violet-700 ring-violet-100";
    case "processing":
      return "bg-amber-50 text-amber-800 ring-amber-100";
    case "returned":
      return "bg-rose-50 text-rose-700 ring-rose-100";
    case "cancelled":
      return "bg-slate-100 text-slate-600 ring-slate-200";
    default:
      // new_inquiry and details_received: received, nothing to worry about yet.
      return "bg-sky-50 text-sky-700 ring-sky-100";
  }
}
