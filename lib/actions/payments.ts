"use server";

import { revalidatePath } from "next/cache";
import { run, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth";

export interface Receipt {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

/** How long a view link lives — long enough to open, useless if forwarded. */
const LINK_SECONDS = 300;

/** The proofs a customer attached to one order, oldest first. */
export async function receiptsForOrder(orderId: string): Promise<Receipt[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payment_receipts")
    .select("id, file_name, mime_type, size_bytes, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Receipt[];
}

/**
 * A short-lived link to look at one receipt.
 *
 * The bucket is private, so the row is read as the caller first — RLS answers
 * whether this staff member may see this order at all — and only then is the
 * service key used to sign a URL for the path it returned.
 */
export async function receiptUrl(
  receiptId: string
): Promise<ActionResult<string>> {
  return run(async () => {
    await requireStaff();
    const supabase = createClient();
    const { data: row, error } = await supabase
      .from("payment_receipts")
      .select("storage_path")
      .eq("id", receiptId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That receipt is no longer there.");

    const admin = createAdminClient();
    const { data, error: signErr } = await admin.storage
      .from("receipts")
      .createSignedUrl(row.storage_path, LINK_SECONDS);
    if (signErr || !data) throw new Error("Could not open that file.");
    return data.signedUrl;
  });
}

/**
 * Accept the payment.
 *
 * The one place an order becomes paid on the prepaid route. A customer saying
 * they paid and attaching a screenshot is a claim; this is someone having
 * looked at the money and agreed, which is why it is staff-only and recorded
 * with a name against it.
 */
export async function verifyPayment(
  orderId: string
): Promise<ActionResult<void>> {
  return run(async () => {
    const staff = await requireStaff();
    if (staff.role === "supplier") {
      throw new Error("Only the office verifies payments.");
    }
    const supabase = createClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        payment_verified_at: now,
        payment_verified_by: staff.id,
        payment_rejected_at: null,
        payment_rejected_reason: null,
      })
      .eq("id", orderId);
    if (error) throw new Error(error.message);

    await supabase.from("order_status_history").insert({
      order_id: orderId,
      event_type: "note",
      note: "Payment verified",
      changed_by: staff.id,
    });

    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
  });
}

/**
 * Turn a payment down, and say why.
 *
 * The reason reaches the customer on their tracking page — they are the only
 * one who can fix it, and "rejected" with no reason is a message that costs a
 * Messenger conversation to decode. The order stays unpaid and keeps its
 * receipts, so a second attempt is a new file rather than a new order.
 */
export async function rejectPayment(
  orderId: string,
  reason: string
): Promise<ActionResult<void>> {
  return run(async () => {
    const staff = await requireStaff();
    if (staff.role === "supplier") {
      throw new Error("Only the office verifies payments.");
    }
    if (!reason.trim()) {
      throw new Error("Say what was wrong, so the customer can re-send.");
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("orders")
      .update({
        payment_status: "unpaid",
        payment_verified_at: null,
        payment_verified_by: null,
        payment_rejected_at: new Date().toISOString(),
        payment_rejected_reason: reason.trim(),
      })
      .eq("id", orderId);
    if (error) throw new Error(error.message);

    await supabase.from("order_status_history").insert({
      order_id: orderId,
      event_type: "note",
      note: `Payment not accepted — ${reason.trim()}`,
      changed_by: staff.id,
    });

    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
  });
}

/** Remove a receipt (a duplicate, or one sent to the wrong order). */
export async function deleteReceipt(
  receiptId: string,
  orderId: string
): Promise<ActionResult<void>> {
  return run(async () => {
    const staff = await requireStaff();
    if (staff.role === "supplier") {
      throw new Error("Only the office manages receipts.");
    }
    const supabase = createClient();
    const { data: row, error: readErr } = await supabase
      .from("payment_receipts")
      .select("storage_path")
      .eq("id", receiptId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) return;

    const { error } = await supabase
      .from("payment_receipts")
      .delete()
      .eq("id", receiptId);
    if (error) throw new Error(error.message);

    const admin = createAdminClient();
    await admin.storage.from("receipts").remove([row.storage_path]);

    revalidatePath(`/orders/${orderId}`);
  });
}
