import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Public config for the order form: which documents are offered, whether OTP
 * is required, and whether the form is open at all. Read-only, and returns
 * only what the form needs — this is the business's own price list.
 */
export async function GET() {
  const db = createAdminClient();
  const [{ data: services }, { data: settings }, { data: page }] = await Promise.all([
    db
      .from("services")
      .select("id, code, name, price, form_fields, processing_days_max, shipping_days_estimate")
      .eq("active", true)
      .order("name"),
    db.from("app_settings").select("key, value"),
    // The default page, same one the tracking pages fall back to.
    db
      .from("messenger_pages")
      .select("url")
      .eq("is_default", true)
      .eq("active", true)
      .maybeSingle(),
  ]);

  const map = new Map((settings ?? []).map((r) => [r.key, r.value ?? ""]));
  return NextResponse.json(
    {
      enabled: (map.get("public_orders_enabled") ?? "true") !== "false",
      otpRequired: (map.get("otp_required") ?? "true") !== "false",
      businessName: map.get("business_name") || "DocuAssist PH",
      messengerUrl: page?.url || map.get("messenger_url") || null,
      services: services ?? [],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
