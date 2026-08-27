import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhPhone } from "@/lib/sms/phone";
import { sendSms } from "@/lib/sms/semaphore";

/**
 * Phone OTP for the public order form.
 *
 * Every send costs real money (Semaphore is ~₱0.50/SMS), and the verify step
 * is a 6-digit guess, so both sides are tightly bounded:
 *
 *   send   — 3 per phone/hour, 6 per IP/hour, 60s cooldown between codes
 *   verify — 5 wrong guesses per code, then the code is dead
 *   expiry — 10 minutes
 *
 * Codes are stored salted-hashed, never in plaintext, and never returned to
 * the browser: the route handler generates the code, stores its hash and hands
 * it to the SMS sender in the same request.
 */

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_PER_PHONE_PER_HOUR = 3;
const OTP_PER_IP_PER_HOUR = 6;

function hash(code: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

/** Cryptographically random 6-digit code (leading zeros preserved). */
function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export type SendResult =
  | { ok: true; stubbed: boolean }
  | { ok: false; error: string; retryAfterSeconds?: number };

export async function sendOtp(
  rawPhone: string,
  ip: string
): Promise<SendResult> {
  const phone = normalizePhPhone(rawPhone);
  if (!phone) {
    return { ok: false, error: "Please enter a valid PH mobile number (09XXXXXXXXX)." };
  }

  const db = createAdminClient();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();

  // --- Cooldown: don't let a customer spam "resend" ---
  const { data: recent } = await db
    .from("otp_verifications")
    .select("created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1);
  if (recent?.[0]) {
    const since = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000;
    if (since < OTP_RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        error: "Please wait a moment before requesting another code.",
        retryAfterSeconds: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - since),
      };
    }
  }

  // --- Hourly caps, per phone and per IP: this is the spend guard ---
  const { count: phoneCount } = await db
    .from("otp_verifications")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", hourAgo);
  if ((phoneCount ?? 0) >= OTP_PER_PHONE_PER_HOUR) {
    return {
      ok: false,
      error:
        "Too many codes requested for this number. Please try again in an hour, or message our page.",
    };
  }

  const { count: ipCount } = await db
    .from("otp_verifications")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", hourAgo);
  if ((ipCount ?? 0) >= OTP_PER_IP_PER_HOUR) {
    return {
      ok: false,
      error: "Too many requests from this device. Please try again later.",
    };
  }

  // --- Mint and store ---
  const code = generateCode();
  const salt = crypto.randomBytes(16).toString("hex");
  const { error } = await db.from("otp_verifications").insert({
    phone,
    code_hash: hash(code, salt),
    salt,
    ip,
    expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) return { ok: false, error: "Could not send a code right now." };

  // --- Send. The template lives in notification_settings like every other. ---
  const outcome = await sendSms("otp", {
    orderId: null,
    phone,
    trackingCode: "",
    code,
  });

  return { ok: true, stubbed: outcome === "stubbed" };
}

export type VerifyResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

export async function verifyOtp(
  rawPhone: string,
  code: string
): Promise<VerifyResult> {
  const phone = normalizePhPhone(rawPhone);
  if (!phone) return { ok: false, error: "Invalid mobile number." };
  if (!/^\d{6}$/.test(code.trim())) {
    return { ok: false, error: "Enter the 6-digit code from the text message." };
  }

  const db = createAdminClient();
  const { data: rows } = await db
    .from("otp_verifications")
    .select("*")
    .eq("phone", phone)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const row = rows?.[0];
  if (!row) {
    return { ok: false, error: "No pending code. Please request a new one." };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "That code has expired. Please request a new one." };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      error: "Too many incorrect attempts. Please request a new code.",
    };
  }

  if (hash(code.trim(), row.salt) !== row.code_hash) {
    await db
      .from("otp_verifications")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    const left = OTP_MAX_ATTEMPTS - (row.attempts + 1);
    return {
      ok: false,
      error:
        left > 0
          ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`
          : "Too many incorrect attempts. Please request a new code.",
    };
  }

  // Correct — mint a single-use token the submit step must present.
  const token = crypto.randomBytes(32).toString("hex");
  await db
    .from("otp_verifications")
    .update({ verified_at: new Date().toISOString(), token })
    .eq("id", row.id);

  return { ok: true, token };
}

/**
 * Consume a verification token. Single-use and bound to the phone number, so a
 * token can't be replayed or reused for a different number.
 */
export async function consumeOtpToken(
  token: string,
  rawPhone: string
): Promise<boolean> {
  const phone = normalizePhPhone(rawPhone);
  if (!phone || !token) return false;

  const db = createAdminClient();
  const { data: rows } = await db
    .from("otp_verifications")
    .select("id, phone, verified_at, token_used_at, expires_at")
    .eq("token", token)
    .limit(1);

  const row = rows?.[0];
  if (!row) return false;
  if (row.phone !== phone) return false;
  if (!row.verified_at) return false;
  if (row.token_used_at) return false; // already spent
  // Token is good for a while after verifying, but not forever.
  if (Date.now() - new Date(row.verified_at).getTime() > 60 * 60_000) return false;

  const { error } = await db
    .from("otp_verifications")
    .update({ token_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("token_used_at", null); // atomic: loses the race if used concurrently
  return !error;
}
