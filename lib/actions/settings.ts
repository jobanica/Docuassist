"use server";

import { run, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";

/** Admin-only guard for settings mutations (§13). */
async function requireAdmin() {
  const staff = await requireStaff();
  if (staff.role !== "admin") {
    throw new Error("Only admins can change settings.");
  }
  return staff;
}

/** Toggle an SMS event on/off (§10). */
export async function setNotificationEnabled(
  eventKey: string,
  enabled: boolean
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const supabase = createClient();
    const { error } = await supabase
      .from("notification_settings")
      .update({ enabled })
      .eq("event_key", eventKey);
    if (error) throw new Error(error.message);
    revalidatePath("/settings/notifications");
  });
}

/** Edit an SMS template (§10) — templates live in the DB, not in components. */
export async function setNotificationTemplate(
  eventKey: string,
  template: string
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    if (!template.trim()) throw new Error("The template cannot be empty.");
    const supabase = createClient();
    const { error } = await supabase
      .from("notification_settings")
      .update({ template: template.trim() })
      .eq("event_key", eventKey);
    if (error) throw new Error(error.message);
    revalidatePath("/settings/notifications");
  });
}

/**
 * Business branding shown on the public tracking page (§6/§7): the business
 * name, the Messenger/Facebook link behind "Message us on Facebook", and an
 * optional logo. Stored in app_settings, which is staff-only under RLS; the
 * public page reads them through the whitelisted get_public_business_info RPC.
 */
export async function updateBusinessInfo(input: {
  business_name: string;
  logo_url: string;
}): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();

    const name = input.business_name.trim();
    if (!name) throw new Error("Business name cannot be empty.");

    // Validate the links rather than letting a typo silently break the public
    // page's only call-to-action.
    for (const [label, raw] of [["Logo URL", input.logo_url]] as const) {
      const v = raw.trim();
      if (!v) continue;
      let url: URL;
      try {
        url = new URL(v);
      } catch {
        throw new Error(`${label} must be a full URL starting with https://`);
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error(`${label} must start with https://`);
      }
    }

    const supabase = createClient();
    const rows = [
      { key: "business_name", value: name },
      { key: "logo_url", value: input.logo_url.trim() },
    ];
    const { error } = await supabase
      .from("app_settings")
      .upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);

    revalidatePath("/settings/business");
  });
}

/**
 * Public self-service ordering: whether the customer-facing form is open, and
 * whether a customer must confirm their mobile number with a one-time code
 * before an order is created (§ owner's choice — OTP costs an SMS per send).
 */
export async function updatePublicOrderSettings(input: {
  public_orders_enabled: boolean;
  otp_required: boolean;
}): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const supabase = createClient();
    const { error } = await supabase.from("app_settings").upsert(
      [
        { key: "public_orders_enabled", value: String(input.public_orders_enabled) },
        { key: "otp_required", value: String(input.otp_required) },
      ],
      { onConflict: "key" }
    );
    if (error) throw new Error(error.message);
    revalidatePath("/settings/public-form");
    revalidatePath("/order");
  });
}
