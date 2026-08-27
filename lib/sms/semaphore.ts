import { createAdminClient } from "@/lib/supabase/admin";
import { interpolate } from "@/lib/publicCopy";
import { trackingUrl } from "@/lib/qr";
import { peso } from "@/lib/money";
import { normalizePhPhone } from "./phone";

const SEMAPHORE_ENDPOINT = "https://api.semaphore.co/api/v4/messages";

/** Events that can trigger an SMS (§10). Keys match notification_settings. */
export type SmsEvent =
  | "details_received"
  | "shipped"
  | "failed_attempt"
  | "delivered"
  | "otp";

export interface SmsContext {
  /** Null for messages not tied to an order yet, e.g. a signup OTP. */
  orderId: string | null;
  /** Customer's first name, for {name} */
  name?: string | null;
  phone?: string | null;
  trackingCode: string;
  totalAmount?: number | null;
  courierName?: string | null;
  trackingNumber?: string | null;
  /** Attempt number for {n} on failed_attempt */
  attempt?: number | null;
  /** One-time code for {code} on the otp template. */
  code?: string | null;
}

export type SmsOutcome = "sent" | "stubbed" | "failed" | "skipped";

/** Build the message body from the DB-held template (§10). */
export function renderTemplate(template: string, ctx: SmsContext): string {
  return interpolate(template, {
    name: ctx.name ?? "",
    link: ctx.trackingCode ? trackingUrl(ctx.trackingCode) : "",
    total: ctx.totalAmount != null ? peso(ctx.totalAmount) : "",
    courier: ctx.courierName ?? "",
    number: ctx.trackingNumber ?? "",
    n: ctx.attempt != null ? String(ctx.attempt) : "",
    code: ctx.code ?? "",
  });
}

/**
 * Fire-and-forget SMS send (§10).
 *
 * - Reads the toggle + template from notification_settings (DB, not hardcoded).
 * - If the event is disabled, or the customer has no usable mobile number,
 *   nothing is sent.
 * - If SEMAPHORE_API_KEY is missing, the send is STUBBED: logged to the console
 *   and written to notifications_log with status 'stubbed' rather than failing.
 * - Every attempt — sent, stubbed, or failed — is written to notifications_log.
 * - Never throws: a broken SMS must not break the order operation that
 *   triggered it.
 */
export async function sendSms(
  event: SmsEvent,
  ctx: SmsContext
): Promise<SmsOutcome> {
  // Service role, deliberately: notification_settings and notifications_log are
  // staff-only under RLS, but SMS is also triggered by unauthenticated paths
  // (the public order form's OTP). With the cookie client those calls silently
  // skipped — no text, no log, no error. This is infrastructure, not
  // user-scoped data, so it reads and writes with the service key.
  const supabase = createAdminClient();

  async function log(
    status: SmsOutcome,
    phone: string | null,
    response: string
  ) {
    try {
      await supabase.from("notifications_log").insert({
        order_id: ctx.orderId,
        type: event,
        phone,
        status,
        response,
      });
    } catch {
      /* logging must never break the caller */
    }
  }

  try {
    const { data: setting } = await supabase
      .from("notification_settings")
      .select("enabled, template")
      .eq("event_key", event)
      .maybeSingle();

    if (!setting) {
      await log("skipped", null, "no notification_settings row for this event");
      return "skipped";
    }
    if (!setting.enabled) {
      // Disabled by the owner in settings — not an error, and not logged as
      // a send attempt beyond this note.
      return "skipped";
    }

    const phone = normalizePhPhone(ctx.phone);
    if (!phone) {
      await log("skipped", ctx.phone ?? null, "no valid PH mobile number");
      return "skipped";
    }

    const message = renderTemplate(setting.template, ctx);
    const apiKey = process.env.SEMAPHORE_API_KEY;

    // --- Stub mode: no key configured -------------------------------------
    if (!apiKey) {
      console.info(
        `[sms:stub] ${event} -> ${phone}: ${message}\n` +
          "         (SEMAPHORE_API_KEY not set — nothing was actually sent.)"
      );
      await log("stubbed", phone, event === "otp" ? "(otp stubbed)" : message);
      return "stubbed";
    }

    // --- Real send ---------------------------------------------------------
    const body = new URLSearchParams({
      apikey: apiKey,
      number: phone,
      message,
    });
    const sender = process.env.SEMAPHORE_SENDER_NAME;
    if (sender) body.set("sendername", sender);

    const res = await fetch(SEMAPHORE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();

    if (!res.ok) {
      console.warn(`[sms] Semaphore ${res.status} for ${event}: ${text}`);
      await log("failed", phone, `HTTP ${res.status}: ${text}`.slice(0, 1000));
      return "failed";
    }

    // The OTP body contains the code — log that a send happened, not what
    // it said, so the log can't be used to complete a verification.
    await log("sent", phone, event === "otp" ? "(otp sent)" : text.slice(0, 1000));
    return "sent";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[sms] send failed for ${event}:`, msg);
    await log("failed", ctx.phone ?? null, msg.slice(0, 1000));
    return "failed";
  }
}
