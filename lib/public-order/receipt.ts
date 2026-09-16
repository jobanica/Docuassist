import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A customer attaching proof that they paid.
 *
 * Runs with the service-role key, so it is the trust boundary. The tracking
 * code is the only thing authorising this — the same secret that already shows
 * the whole order on its tracking page — so a wrong or unknown code is
 * indistinguishable from a right one that has no order, on purpose.
 *
 * Nothing here marks the payment good. It records that the customer says they
 * paid and hands staff the evidence; only a staff member moves the order to
 * paid, which is the entire point of the step.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
/** More than this many on one order is someone hammering the button. */
const MAX_PER_ORDER = 6;

export type ReceiptResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export async function uploadReceipt(input: {
  trackingCode: string;
  fileName: string;
  mimeType: string;
  /** Base64, no data: prefix. */
  data: string;
  ip: string;
}): Promise<ReceiptResult> {
  const db = createAdminClient();

  const { data: allowed, error: rlErr } = await db.rpc("check_rate_limit", {
    p_key: `receipt:${input.ip}`,
    p_max: 20,
    p_window_seconds: 600,
  });
  if (!rlErr && allowed === false) {
    return { ok: false, error: "Too many uploads. Please wait a minute." };
  }

  if (!ALLOWED.has(input.mimeType)) {
    return {
      ok: false,
      error: "Send a photo or screenshot (JPG, PNG, HEIC) or a PDF.",
    };
  }
  const bytes = Buffer.from(input.data, "base64");
  if (bytes.length === 0) return { ok: false, error: "That file came through empty." };
  if (bytes.length > MAX_BYTES) {
    return { ok: false, error: "That file is over 8MB — send a screenshot instead." };
  }

  const code = String(input.trackingCode ?? "").trim().toUpperCase();
  if (!code) return { ok: false, error: "Missing your order reference." };

  const { data: order } = await db
    .from("orders")
    .select("id, payment_status, merged_into")
    .eq("tracking_code", code)
    .maybeSingle();
  // Deliberately the same answer for "no such order" and "not yours".
  if (!order) return { ok: false, error: "We couldn't find that order." };
  if (order.payment_status === "paid") {
    return { ok: false, error: "This order's payment is already confirmed." };
  }

  const orderId = order.merged_into ?? order.id;

  const { count } = await db
    .from("payment_receipts")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if ((count ?? 0) >= MAX_PER_ORDER) {
    return {
      ok: false,
      error: "That's enough files for one order — message us instead.",
    };
  }

  // The customer's filename is never used as a path: a stray "/" or "..", or
  // two people sending "receipt.jpg", would collide or escape the folder.
  const ext =
    (input.fileName.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "jpg").toLowerCase();
  const path = `${orderId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await db.storage
    .from("receipts")
    .upload(path, bytes, { contentType: input.mimeType, upsert: false });
  if (upErr) return { ok: false, error: "Could not save that file. Please retry." };

  const { error: rowErr } = await db.from("payment_receipts").insert({
    order_id: orderId,
    storage_path: path,
    file_name: input.fileName.slice(0, 200),
    mime_type: input.mimeType,
    size_bytes: bytes.length,
  });
  if (rowErr) {
    // Never leave a file in the bucket that nothing points at.
    await db.storage.from("receipts").remove([path]);
    return { ok: false, error: "Could not save that file. Please retry." };
  }

  // Marks it as waiting for someone to check — and only that.
  await db
    .from("orders")
    .update({
      payment_submitted_at: new Date().toISOString(),
      payment_rejected_at: null,
      payment_rejected_reason: null,
    })
    .eq("id", orderId);

  await db.from("order_status_history").insert({
    order_id: orderId,
    event_type: "note",
    note: "Customer uploaded proof of payment",
  });

  return { ok: true, count: (count ?? 0) + 1 };
}
