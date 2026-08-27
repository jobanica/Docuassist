"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { nextStatus, canCancel, PIPELINE } from "@/lib/status";
import { addDaysISO } from "@/lib/dates";
import type { StatusCode } from "@/lib/types";

const orderItemSchema = z.object({
  service_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).default(1),
  price_at_order: z.coerce.number().min(0),
  form_details: z.record(z.string(), z.string()).default({}),
});

const createOrderSchema = z.object({
  customer_id: z.string().uuid(),
  initial_status: z.enum(["new_inquiry", "details_received"]),
  items: z.array(orderItemSchema).min(1, "Add at least one service"),
});

export type CreateOrderInput = z.input<typeof createOrderSchema>;

export async function createOrder(
  input: CreateOrderInput
): Promise<{ id: string }> {
  const staff = await requireStaff();
  const parsed = createOrderSchema.parse(input);
  const supabase = createClient();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      customer_id: parsed.customer_id,
      status: parsed.initial_status,
    })
    .select("id")
    .single();
  if (orderErr) throw new Error(orderErr.message);

  const { error: itemsErr } = await supabase.from("order_items").insert(
    parsed.items.map((it) => ({
      order_id: order.id,
      service_id: it.service_id,
      quantity: it.quantity,
      price_at_order: it.price_at_order,
      form_details: it.form_details,
    }))
  );
  if (itemsErr) throw new Error(itemsErr.message);

  await supabase.from("order_status_history").insert({
    order_id: order.id,
    status: parsed.initial_status,
    event_type: "status_change",
    note: "Order encoded",
    changed_by: staff.id,
  });

  revalidatePath("/orders");
  return { id: order.id };
}

/**
 * Compute expected release/delivery dates from the order's services.
 * release = today + max(processing_days_max); delivery = release + max(shipping).
 */
async function computeExpectedDates(orderId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("order_items")
    .select("services(processing_days_max, shipping_days_estimate)")
    .eq("order_id", orderId);

  let maxProcessing = 14;
  let maxShipping = 7;
  for (const row of (data ?? []) as any[]) {
    // Supabase may type the embedded relation as an object or an array.
    const rel = row.services;
    const svc = Array.isArray(rel) ? rel[0] : rel;
    if (svc) {
      maxProcessing = Math.max(maxProcessing, Number(svc.processing_days_max));
      maxShipping = Math.max(maxShipping, Number(svc.shipping_days_estimate));
    }
  }
  const today = new Date();
  const expected_release_date = addDaysISO(today, maxProcessing);
  const expected_delivery_date = addDaysISO(
    new Date(expected_release_date),
    maxShipping
  );
  return { expected_release_date, expected_delivery_date };
}

/**
 * Advance an order to the next pipeline status (forward only). §4
 * `released → shipped` requires courier details, so it goes through
 * markShipped(); `shipped → delivered` goes through markDelivered().
 */
export async function advanceStatus(
  orderId: string,
  note?: string
): Promise<{ status: StatusCode }> {
  const staff = await requireStaff();
  const supabase = createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (error) throw new Error(error.message);

  const current = order.status as StatusCode;
  const target = nextStatus(current);
  if (!target) throw new Error("Order is already at the final stage.");
  if (target === "shipped") {
    throw new Error(
      "Use “Mark as Shipped” — a courier and tracking number are required."
    );
  }
  if (target === "delivered") {
    throw new Error("Use “Mark as Delivered” to record COD collection.");
  }

  const patch: Record<string, unknown> = { status: target };
  if (target === "processing") {
    Object.assign(patch, await computeExpectedDates(orderId));
  }

  const { error: upErr } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId);
  if (upErr) throw new Error(upErr.message);

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: target,
    event_type: "status_change",
    note: note?.trim() || null,
    changed_by: staff.id,
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { status: target };
}

/** Admin correction: move an order backward to an earlier stage with a reason. §4 */
export async function correctStatusBackward(
  orderId: string,
  targetStatus: StatusCode,
  reason: string
): Promise<void> {
  const staff = await requireStaff();
  if (!reason.trim()) throw new Error("A reason is required for corrections.");

  const supabase = createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (error) throw new Error(error.message);

  const current = order.status as StatusCode;
  const ci = PIPELINE.indexOf(current);
  const ti = PIPELINE.indexOf(targetStatus);
  if (ti === -1 || ci === -1 || ti >= ci) {
    throw new Error("Backward correction must target an earlier stage.");
  }

  const { error: upErr } = await supabase
    .from("orders")
    .update({ status: targetStatus })
    .eq("id", orderId);
  if (upErr) throw new Error(upErr.message);

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: targetStatus,
    event_type: "backward_correction",
    note: reason.trim(),
    changed_by: staff.id,
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

/** Cancel an order (reachable before shipped) with a required reason. §4 */
export async function cancelOrder(
  orderId: string,
  reason: string
): Promise<void> {
  const staff = await requireStaff();
  if (!reason.trim()) throw new Error("A cancellation reason is required.");

  const supabase = createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (error) throw new Error(error.message);

  if (!canCancel(order.status as StatusCode)) {
    throw new Error("This order can no longer be cancelled.");
  }

  const { error: upErr } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason.trim(),
    })
    .eq("id", orderId);
  if (upErr) throw new Error(upErr.message);

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: "cancelled",
    event_type: "status_change",
    note: reason.trim(),
    changed_by: staff.id,
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

/**
 * released → shipped. Requires a courier and tracking number (§8). Records
 * shipped_at and refreshes the expected delivery date from that moment.
 */
export async function markShipped(
  orderId: string,
  courierId: string,
  trackingNumber: string,
  note?: string
): Promise<void> {
  const staff = await requireStaff();
  if (!courierId) throw new Error("Pick a courier.");
  if (!trackingNumber.trim()) {
    throw new Error("Enter the courier tracking number.");
  }

  const supabase = createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (error) throw new Error(error.message);
  if (order.status !== "released") {
    throw new Error("Only a released order can be marked as shipped.");
  }

  const now = new Date();
  const { expected_delivery_date } = await computeShippingEstimate(
    orderId,
    now
  );

  const { error: upErr } = await supabase
    .from("orders")
    .update({
      status: "shipped",
      courier_id: courierId,
      courier_tracking_number: trackingNumber.trim(),
      shipped_at: now.toISOString(),
      expected_delivery_date,
    })
    .eq("id", orderId);
  if (upErr) throw new Error(upErr.message);

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: "shipped",
    event_type: "status_change",
    note: note?.trim() || null,
    changed_by: staff.id,
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

/** Expected delivery = ship date + max(shipping_days_estimate) across items. */
async function computeShippingEstimate(orderId: string, from: Date) {
  const supabase = createClient();
  const { data } = await supabase
    .from("order_items")
    .select("services(shipping_days_estimate)")
    .eq("order_id", orderId);

  let maxShipping = 7;
  for (const row of (data ?? []) as any[]) {
    const rel = row.services;
    const svc = Array.isArray(rel) ? rel[0] : rel;
    if (svc) maxShipping = Math.max(maxShipping, Number(svc.shipping_days_estimate));
  }
  return { expected_delivery_date: addDaysISO(from, maxShipping) };
}

/**
 * Log a failed delivery attempt while shipped (§4). Increments
 * delivery_attempts (capped at 3) and writes a failed_attempt history event.
 */
export async function logFailedAttempt(
  orderId: string,
  reason: string
): Promise<{ attempts: number }> {
  const staff = await requireStaff();
  if (!reason.trim()) throw new Error("Pick or enter a reason.");

  const supabase = createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("status, delivery_attempts")
    .eq("id", orderId)
    .single();
  if (error) throw new Error(error.message);
  if (order.status !== "shipped") {
    throw new Error("Failed attempts can only be logged while shipped.");
  }
  if (order.delivery_attempts >= 3) {
    throw new Error(
      "This order already has 3 failed attempts — mark it as Returned."
    );
  }

  const attempts = order.delivery_attempts + 1;
  const { error: upErr } = await supabase
    .from("orders")
    .update({ delivery_attempts: attempts })
    .eq("id", orderId);
  if (upErr) throw new Error(upErr.message);

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: null,
    event_type: "failed_attempt",
    attempt_number: attempts,
    note: reason.trim(),
    changed_by: staff.id,
  });

  // Phase 6 wires the failed-attempt SMS nudge here (highest-priority send).
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { attempts };
}

/**
 * shipped → delivered, with the COD outcome (§4/§11). `codCollected` marks
 * payment_status; an uncollected delivery stays 'unpaid' for the ledger.
 */
export async function markDelivered(
  orderId: string,
  codCollected: boolean,
  note?: string
): Promise<void> {
  const staff = await requireStaff();
  const supabase = createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (error) throw new Error(error.message);
  if (order.status !== "shipped") {
    throw new Error("Only a shipped order can be marked as delivered.");
  }

  const { error: upErr } = await supabase
    .from("orders")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      payment_status: codCollected ? "paid" : "unpaid",
    })
    .eq("id", orderId);
  if (upErr) throw new Error(upErr.message);

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: "delivered",
    event_type: "status_change",
    note:
      note?.trim() ||
      (codCollected ? "COD collected" : "Delivered — COD not yet collected"),
    changed_by: staff.id,
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

/** Toggle the COD payment status on a delivered order (§8). */
export async function setPaymentStatus(
  orderId: string,
  paid: boolean
): Promise<void> {
  const staff = await requireStaff();
  const supabase = createClient();

  const { error } = await supabase
    .from("orders")
    .update({ payment_status: paid ? "paid" : "unpaid" })
    .eq("id", orderId);
  if (error) throw new Error(error.message);

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: null,
    event_type: "status_change",
    note: paid ? "COD marked as collected" : "COD marked as not collected",
    changed_by: staff.id,
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

/**
 * Mark an order returned to sender (§4). Reachable from `shipped` — normally
 * after 3 failed attempts, but staff may return earlier (e.g. bad address).
 * A lost sale: recorded with returned_at + reason for the §11 ledger.
 */
export async function markReturned(
  orderId: string,
  reason: string
): Promise<void> {
  const staff = await requireStaff();
  if (!reason.trim()) throw new Error("A return reason is required.");

  const supabase = createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (error) throw new Error(error.message);
  if (order.status !== "shipped") {
    throw new Error("Only a shipped order can be returned to sender.");
  }

  const { error: upErr } = await supabase
    .from("orders")
    .update({
      status: "returned",
      returned_at: new Date().toISOString(),
      return_reason: reason.trim(),
    })
    .eq("id", orderId);
  if (upErr) throw new Error(upErr.message);

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: "returned",
    event_type: "status_change",
    note: reason.trim(),
    changed_by: staff.id,
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}
