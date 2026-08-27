import { createClient } from "@supabase/supabase-js";
import type { StatusCode } from "./types";

/** Whitelisted shape returned by the get_tracking_info RPC (§13). */
export interface TrackingInfo {
  tracking_code: string;
  first_name: string | null;
  service_names: string[];
  status: StatusCode;
  status_label: string;
  status_sort_order: number;
  is_terminal: boolean;
  public_helper: string | null;
  total_amount: number;
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
  /** The Facebook page this order's customer should message. */
  messenger: { name: string; url: string } | null;
  history: {
    status: StatusCode | null;
    label: string | null;
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
}

export type LookupResult =
  | { kind: "ok"; data: TrackingInfo }
  | { kind: "not_found" }
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
    { auth: { persistSession: false, autoRefreshToken: false } }
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

/** Public, non-sensitive business branding (name, Messenger link, logo). */
export async function getBusinessInfo(): Promise<BusinessInfo> {
  const supabase = publicClient();
  const { data } = await supabase.rpc("get_public_business_info");
  return (
    (data as BusinessInfo) ?? {
      business_name: "DocuAssist PH",
      messenger_url: null,
      logo_url: null,
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
