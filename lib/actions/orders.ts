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
 * NOTE: the `released → shipped` transition requires courier details and is
 * handled in Phase 4; here advancement is capped at `released`.
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
      "Shipping details (courier + tracking number) are set up in Phase 4."
    );
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
