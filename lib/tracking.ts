import { createClient } from "@supabase/supabase-js";
import type { StatusCode } from "./types";

/** Whitelisted shape returned by the get_tracking_info RPC (§13). */
export interface TrackingInfo {
  tracking_code: string;
  first_name: string | null;
  service_names: string[];
  /** Each document with the person named on it — the only thing that tells
   *  two birth certificates on one order apart. */
  documents: {
    service_name: string;
    quantity: number;
    /** "" when the form has not been filled in yet. */
    owner_name: string | null;
  }[];
  status: StatusCode;
  status_label: string;
  status_sort_order: number;
  is_terminal: boolean;
  public_helper: string | null;
  total_amount: number;
  /** Taken off before the total above. Shown so a promised discount is seen. */
  discount_amount: number;
  payment_method: string;
  payment_status: "unpaid" | "paid";
  courier: {
    name: string;
    tracking_page_url: string | null;
    tracking_number: string | null;
  } | null;
  delivery_attempts: number;
  expected_release_date: string | null;
  expected_delivery_date: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  return_reason: string | null;
  /** Set when the supplier has flagged the job as held up. */
  is_delayed: boolean;
  delayed_at: string | null;
  /** Written by whoever is processing the document, shown here word for word. */
  delay_reason: string | null;
  /** The Facebook page this order's customer should message. */
  messenger: { name: string; url: string } | null;
  history: {
    status: StatusCode | null;
    label: string | null;
    /** 'note' is filtered out server-side — the office's trail, not theirs. */
    event_type: "status_change" | "failed_attempt" | "backward_correction";
    attempt_number: number | null;
    note: string | null;
    date: string;
  }[];
}

export interface BusinessInfo {
  business_name: string;
  messenger_url: string | null;
  logo_url: string | null;
  /** The logo image already carries the business name, so the header shows it
   *  larger and doesn't repeat the name as text underneath. */
  logo_includes_name: boolean;
}

export type LookupResult =
  | { kind: "ok"; data: TrackingInfo }
  | { kind: "not_found" }
  | { kind: "rate_limited" };

/**
 * One order in the centralized search results. A deliberately small slice of
 * TrackingInfo — enough to recognise the order and see where it has reached,
 * with the tracking_code to open its full page. No money, address, or contact.
 */
export interface TrackingSummary {
  tracking_code: string;
  first_name: string | null;
  status: StatusCode;
  status_label: string;
  status_sort_order: number;
  is_terminal: boolean;
  is_delayed: boolean;
  expected_delivery_date: string | null;
  created_at: string;
  documents: {
    service_name: string;
    quantity: number;
    owner_name: string | null;
  }[];
}

export type SearchResult =
  | { kind: "ok"; data: TrackingSummary[] }
  | { kind: "rate_limited" };

/** What the centralized search action hands back to the page. */
export type TrackSearchResult =
  | { kind: "ok"; data: TrackingSummary[] }
  | { kind: "need_phone" }
  | { kind: "rate_limited" };

const RATE_MAX = 30; // lookups per IP per window
const RATE_WINDOW = 60; // seconds

/**
 * A bare anon Supabase client (no cookies / no session). It can ONLY reach the
 * whitelisted SECURITY DEFINER functions granted to anon — every table is
 * blocked by RLS. Never use this for staff/admin data.
 */
function publicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      // Never let Next's data cache answer for these.
      //
      // Everything a customer sees comes through here: their order status, the
      // business name, the logo. Cached, the tracking page happily serves an
      // answer from days ago — an order that has since shipped still reading as
      // Processing, or a logo that has since been replaced. These calls are
      // cheap and always want to be live, so they opt out explicitly rather
      // than relying on the page's rendering mode to do it for them.
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}

/** Rate-limited public tracking lookup. Returns only whitelisted fields. */
export async function lookupTracking(
  code: string,
  ip: string
): Promise<LookupResult> {
  const supabase = publicClient();

  const { data: allowed, error: rlErr } = await supabase.rpc(
    "check_rate_limit",
    { p_key: `track:${ip}`, p_max: RATE_MAX, p_window_seconds: RATE_WINDOW }
  );
  // Fail open on limiter errors (availability > strictness), but honor a false.
  if (!rlErr && allowed === false) {
    return { kind: "rate_limited" };
  }

  const { data, error } = await supabase.rpc("get_tracking_info", {
    p_code: code,
  });
  if (error) throw new Error(error.message);
  if (!data) return { kind: "not_found" };
  return { kind: "ok", data: data as TrackingInfo };
}

const SEARCH_MAX = 15; // searches per IP per window — tighter than a code lookup
const SEARCH_WINDOW = 60; // seconds

/**
 * Centralized tracking search, keyed by phone number.
 *
 * Phone is required (a name alone must not surface a stranger's documents); a
 * name only narrows the matches. Returns whitelisted summaries and nothing
 * else — the database function is the choke point, this just calls it under
 * the same per-IP rate limit as the single-order lookup.
 */
export async function searchTrackingByPhone(
  phone: string,
  name: string,
  ip: string
): Promise<SearchResult> {
  const supabase = publicClient();

  const { data: allowed, error: rlErr } = await supabase.rpc("check_rate_limit", {
    p_key: `tracksearch:${ip}`,
    p_max: SEARCH_MAX,
    p_window_seconds: SEARCH_WINDOW,
  });
  if (!rlErr && allowed === false) {
    return { kind: "rate_limited" };
  }

  const { data, error } = await supabase.rpc("search_tracking_by_phone", {
    p_phone: phone,
    p_name: name || null,
  });
  if (error) throw new Error(error.message);
  return { kind: "ok", data: (data ?? []) as TrackingSummary[] };
}

/** Public, non-sensitive business branding (name, Messenger link, logo). */
export async function getBusinessInfo(): Promise<BusinessInfo> {
  const supabase = publicClient();
  const { data } = await supabase.rpc("get_public_business_info");
  return (
    (data as BusinessInfo) ?? {
      business_name: "DocuAssist PH",
      messenger_url: null,
      logo_url: null,
      logo_includes_name: false,
    }
  );
}

export interface PipelineStage {
  code: StatusCode;
  label: string;
}

/** DB-driven labels for the six forward pipeline stages (for the stepper). */
export async function getPublicPipeline(): Promise<PipelineStage[]> {
  const supabase = publicClient();
  const { data } = await supabase.rpc("get_public_pipeline");
  return (data as PipelineStage[]) ?? [];
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
