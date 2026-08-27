import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicOrderSchema, submitPublicOrder } from "@/lib/public-order/submit";
import { consumeOtpToken } from "@/lib/public-order/otp";
import { clientIp } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/** Orders per IP per hour — a spam guard on an unauthenticated write path. */
const SUBMIT_PER_IP_PER_HOUR = 5;

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const db = createAdminClient();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // --- Is the form even open? ---
  const { data: settings } = await db.from("app_settings").select("key, value");
  const map = new Map((settings ?? []).map((r) => [r.key, r.value ?? ""]));
  if ((map.get("public_orders_enabled") ?? "true") === "false") {
    return NextResponse.json(
      { error: "Online ordering is closed right now. Please message our page." },
      { status: 403 }
    );
  }
  const otpRequired = (map.get("otp_required") ?? "true") !== "false";

  // --- Rate limit before doing any work ---
  const { data: allowed } = await db.rpc("check_rate_limit", {
    p_key: `order-submit:${ip}`,
    p_max: SUBMIT_PER_IP_PER_HOUR,
    p_window_seconds: 3600,
  });
  if (allowed === false) {
    return NextResponse.json(
      { error: "Too many orders from this device. Please message our page instead." },
      { status: 429 }
    );
  }

  // --- Validate the payload ---
  const parsed = publicOrderSchema.safeParse(body?.order);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check the form." },
      { status: 400 }
    );
  }

  // --- Phone confirmation, when the owner requires it ---
  if (otpRequired) {
    const ok = await consumeOtpToken(
      String(body?.otpToken ?? ""),
      parsed.data.phone
    );
    if (!ok) {
      return NextResponse.json(
        { error: "Please confirm your mobile number first." },
        { status: 401 }
      );
    }
  }

  const result = await submitPublicOrder(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, trackingCode: result.trackingCode });
}
