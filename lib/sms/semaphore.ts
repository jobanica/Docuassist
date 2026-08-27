import { createClient } from "@/lib/supabase/server";
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
  | "delivered";

export interface SmsContext {
  orderId: string;
  /** Customer's first name, for {name} */
  name?: string | null;
  phone?: string | null;
  trackingCode: string;
  totalAmount?: number | null;
  courierName?: string | null;
  trackingNumber?: string | null;
  /** Attempt number for {n} on failed_attempt */
  attempt?: number | null;
}

export type SmsOutcome = "sent" | "stubbed" | "failed" | "skipped";

/** Build the message body from the DB-held template (§10). */
export function renderTemplate(template: string, ctx: SmsContext): string {
  return interpolate(template, {
    name: ctx.name ?? "",
    link: trackingUrl(ctx.trackingCode),
    total: ctx.totalAmount != null ? peso(ctx.totalAmount) : "",
    courier: ctx.courierName ?? "",
    number: ctx.trackingNumber ?? "",
    n: ctx.attempt != null ? String(ctx.attempt) : "",
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
  const supabase = createClient();

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
      await log("stubbed", phone, message);
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

    await log("sent", phone, text.slice(0, 1000));
    return "sent";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[sms] send failed for ${event}:`, msg);
    await log("failed", ctx.phone ?? null, msg.slice(0, 1000));
    return "failed";
  }
}
