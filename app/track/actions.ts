"use server";

import { headers } from "next/headers";
import {
  searchTrackingByPhone,
  clientIp,
  type TrackSearchResult,
} from "@/lib/tracking";

/**
 * The centralized search's one action: phone in, whitelisted summaries out.
 *
 * A phone with fewer than 10 digits is refused before the lookup rather than
 * returned as "no orders" — that keeps a short or empty box from reading like
 * a real (failed) search, and stops it counting against the rate limit.
 */
export async function searchOrders(
  phone: string,
  name: string
): Promise<TrackSearchResult> {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 10) return { kind: "need_phone" };

  const ip = clientIp(headers());
  const res = await searchTrackingByPhone(phone, (name || "").trim(), ip);
  if (res.kind === "rate_limited") return { kind: "rate_limited" };
  return { kind: "ok", data: res.data };
}
