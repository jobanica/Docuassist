"use server";

import { run, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * Upload the business logo and point the settings at it.
 *
 * The logo used to be whatever URL someone pasted, which in practice was a
 * Facebook CDN link — those expire, and the customer-facing tracking pages
 * ended up showing a broken image. Holding the file ourselves in a public
 * bucket is the only version of this that keeps working: the tracking pages
 * are opened by customers who are not logged in, so a signed URL would expire
 * the same way.
 *
 * The stored name is never used as a path — a stray "/" or two people sending
 * "logo.png" would collide or escape — and each upload gets its own filename
 * so a replacement is never served from a stale cache.
 */
export async function uploadBusinessLogo(
  fileName: string,
  mimeType: string,
  /** Base64, no data: prefix. */
  data: string
): Promise<ActionResult<{ url: string }>> {
  return run(async () => {
    await requireAdmin();

    const allowed = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ]);
    if (!allowed.has(mimeType)) {
      throw new Error("Use a PNG, JPG, WebP or SVG file for the logo.");
    }

    const bytes = Buffer.from(data, "base64");
    if (bytes.length === 0) throw new Error("That file came through empty.");
    if (bytes.length > 2 * 1024 * 1024) {
      throw new Error("That logo is over 2MB — save a smaller copy and retry.");
    }

    const ext =
      (fileName.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "png").toLowerCase();
    const path = `logo-${Date.now()}.${ext}`;

    const admin = createAdminClient();
    const { error: upErr } = await admin.storage
      .from("branding")
      .upload(path, bytes, { contentType: mimeType, upsert: true });
    if (upErr) throw new Error(upErr.message);

    const {
      data: { publicUrl },
    } = admin.storage.from("branding").getPublicUrl(path);

    const supabase = createClient();
    const { error } = await supabase
      .from("app_settings")
      .upsert([{ key: "logo_url", value: publicUrl }], { onConflict: "key" });
    if (error) throw new Error(error.message);

    revalidatePath("/settings/business");
    return { url: publicUrl };
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

/**
 * Auto-fill (parsing) switches. Admin only, and read per parse so turning it
 * off takes effect immediately rather than at the next deploy.
 */
export async function updateParsingSettings(input: {
  parsing_enabled: boolean;
  parsing_ai_enabled: boolean;
}): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const supabase = createClient();
    const { error } = await supabase.from("app_settings").upsert(
      [
        { key: "parsing_enabled", value: String(input.parsing_enabled) },
        { key: "parsing_ai_enabled", value: String(input.parsing_ai_enabled) },
      ],
      { onConflict: "key" }
    );
    if (error) throw new Error(error.message);
    revalidatePath("/settings/parsing");
  });
}

/**
 * What a return costs the business, per document (§11).
 *
 * These are the parts of the loss the dashboard reports when a parcel comes
 * back: the PSA and encoding already paid for, the courier's round trip, the
 * agent's commission, and the ad spend that won the order. They live in
 * settings rather than in code because every one of them moves — a courier
 * raises its rate, a campaign gets cheaper — and none of that is worth a
 * deploy.
 */
export async function updateRtsCosts(input: {
  processing: string;
  shipping: string;
  commission: string;
  ad: string;
}): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();

    const entries: [string, string][] = [
      ["rts_cost_processing", input.processing],
      ["rts_cost_shipping", input.shipping],
      ["rts_cost_commission", input.commission],
      ["rts_cost_ad", input.ad],
    ];

    const rows = entries.map(([key, raw]) => {
      const v = (raw ?? "").trim();
      // A blank box means "this part costs nothing", which is a real answer —
      // but a typo must not silently become zero and understate the losses.
      if (v && !/^\d+(\.\d{1,2})?$/.test(v)) {
        throw new Error(
          `"${v}" is not an amount. Enter pesos in digits, e.g. 205 or 205.50.`
        );
      }
      return { key, value: v || "0" };
    });

    const supabase = createClient();
    const { error } = await supabase
      .from("app_settings")
      .upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);

    revalidatePath("/settings/rts-costs");
    revalidatePath("/dashboard");
  });
}

/**
 * The shipping fee baked into every service price (§8).
 *
 * A PSA birth certificate is priced ₱685 — ₱500 for the document and ₱185 to
 * get it to the customer. Combining orders is worth doing precisely because
 * documents travelling together owe one delivery between them, so the figure
 * has to be readable from the board, not just from the dashboard.
 */
export async function shippingFee(): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "shipping_fee")
    .maybeSingle();
  const n = Number((data?.value ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Set it. Couriers raise their rates; that is not worth a deploy. */
export async function updateShippingFee(
  value: string
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const v = (value ?? "").trim();
    if (v && !/^\d+(\.\d{1,2})?$/.test(v)) {
      throw new Error(
        `"${v}" is not an amount. Enter pesos in digits, e.g. 185 or 185.50.`
      );
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("app_settings")
      .upsert([{ key: "shipping_fee", value: v || "0" }], { onConflict: "key" });
    if (error) throw new Error(error.message);
    revalidatePath("/settings/services");
    revalidatePath("/orders");
  });
}

/**
 * What it costs to have an agency look up a forgotten TIN or PhilHealth
 * number (§8). A separate errand at the BIR or PhilHealth office, so a
 * separate fee — the ID still earns what an ID earns.
 */
export async function idVerificationFee(): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "id_verification_fee")
    .maybeSingle();
  const n = Number((data?.value ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Set it. Agencies and errands change price; that is not worth a deploy. */
export async function updateIdVerificationFee(
  value: string
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const v = (value ?? "").trim();
    if (v && !/^\d+(\.\d{1,2})?$/.test(v)) {
      throw new Error(
        `"${v}" is not an amount. Enter pesos in digits, e.g. 100 or 100.50.`
      );
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("app_settings")
      .upsert([{ key: "id_verification_fee", value: v || "0" }], {
        onConflict: "key",
      });
    if (error) throw new Error(error.message);
    revalidatePath("/settings/services");
    revalidatePath("/orders");
  });
}
