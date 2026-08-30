"use server";

import { run, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { nextStatus, canCancel, PIPELINE } from "@/lib/status";
import { addDaysISO } from "@/lib/dates";
import { notifyOrder } from "@/lib/sms/notify";
import type { StatusCode } from "@/lib/types";

const orderItemSchema = z.object({
  service_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).default(1),
  price_at_order: z.coerce.number().min(0),
  /** Structured fields — filled by the customer's own order form, or by staff
   *  on the order when they are about to print the PSA form. */
  form_details: z.record(z.string(), z.string()).default({}),
  /** The customer's reply pasted verbatim by staff. Kept as sent. */
  pasted_details: z.string().max(20000).default(""),
});

const createOrderSchema = z.object({
  customer_id: z.string().uuid(),
  initial_status: z.enum(["new_inquiry", "details_received"]),
  /** Facebook page the tracking link points at. Null falls back to the
   *  business default when the page is rendered. */
  messenger_page_id: z.string().uuid().nullable().default(null),
  items: z.array(orderItemSchema).min(1, "Add at least one service"),
});

export type CreateOrderInput = z.input<typeof createOrderSchema>;

export async function createOrder(
  input: CreateOrderInput
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const staff = await requireStaff();
    const parsed = createOrderSchema.parse(input);
    const supabase = createClient();

    // A parcel needs all four parts of an address, so an order that is ready
    // to work cannot be missing them. A stub raised before the customer has
    // replied is exempt — that is what the stub is for.
    if (parsed.initial_status === "details_received") {
      const { data: c } = await supabase
        .from("customers")
        .select("address_line, barangay, city, province")
        .eq("id", parsed.customer_id)
        .maybeSingle();
      const missing = (
        [
          ["address_line", "house no. / street / purok"],
          ["barangay", "barangay"],
          ["city", "city or municipality"],
          ["province", "province"],
        ] as const
      )
        .filter(([k]) => !String((c as any)?.[k] ?? "").trim())
        .map(([, label]) => label);
      if (missing.length > 0) {
        throw new Error(
          `The delivery address needs the ${missing.join(
            ", "
          )}. Add it to the customer, or save this as a new inquiry for now.`
        );
      }
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        customer_id: parsed.customer_id,
        status: parsed.initial_status,
        // Who took this one. The board shows it, so a follow-up goes to the
        // person who actually spoke to the customer.
        created_by: staff.id,
        // Falls back to whichever page this staff member answers on, so the VA
        // running a separate page doesn't have to remember to switch it.
        messenger_page_id:
          parsed.messenger_page_id ?? staff.default_messenger_page_id,
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
        pasted_details: it.pasted_details.trim() || null,
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

    if (parsed.initial_status === "details_received") {
      await notifyOrder("details_received", order.id);
    }

    revalidatePath("/orders");
    return { id: order.id };
  });
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
): Promise<ActionResult<{ status: StatusCode }>> {
  return run(async () => {
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

    if (target === "details_received") {
      await notifyOrder("details_received", orderId);
    }

    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
    return { status: target };
  });
}

/**
 * Advance several orders one stage in one go — the morning routine is a batch
 * of orders sitting at the same stage, not one order at a time.
 *
 * Every selected order must already be at the SAME status. Mixing them is
 * refused rather than guessed at: "move these to processing" means something
 * different for an order still at new inquiry, and silently skipping or
 * dragging it forward would both be wrong. The board hides the button when the
 * selection is mixed; this is the check that actually enforces it.
 */
export async function bulkAdvanceStatus(
  orderIds: string[]
): Promise<ActionResult<{ status: StatusCode; count: number }>> {
  return run(async () => {
    const staff = await requireStaff();
    const ids = Array.from(new Set(orderIds.filter(Boolean)));
    if (ids.length === 0) throw new Error("Select at least one order first.");

    const supabase = createClient();
    const [{ data: rows, error }, { data: statusRows }] = await Promise.all([
      supabase.from("orders").select("id, status").in("id", ids),
      supabase.from("order_statuses").select("code, label"),
    ]);
    if (error) throw new Error(error.message);

    const label = (code: string) =>
      (statusRows ?? []).find((s) => s.code === code)?.label ?? code;

    // A scoped account may not be allowed to see every id the browser sent,
    // and an order can be cancelled from another tab in the meantime.
    if (!rows || rows.length !== ids.length) {
      throw new Error(
        "Some of those orders are no longer available — refresh the board and select again. Nothing was changed."
      );
    }

    const present = Array.from(new Set(rows.map((r) => r.status)));
    if (present.length > 1) {
      throw new Error(
        `Those orders are at different stages (${present
          .map(label)
          .join(", ")}). Select orders that share one status, then change them together.`
      );
    }

    const current = present[0] as StatusCode;
    const target = nextStatus(current);
    if (!target) {
      throw new Error(
        `Those orders are at ${label(current)}, which has no next stage.`
      );
    }
    if (target === "shipped") {
      throw new Error(
        "Shipping needs a courier and tracking number for each order, so it can't be done in bulk. Open each order and use “Mark as Shipped”."
      );
    }
    if (target === "delivered") {
      throw new Error(
        "Marking delivered records the COD collection per order. Open each one and use “Mark as Delivered”."
      );
    }

    // `processing` stamps expected dates computed from that order's own
    // services, so those rows are written one at a time; the rest is one query.
    const done: string[] = [];
    let failure: string | null = null;
    if (target === "processing") {
      for (const id of ids) {
        const { error: upErr } = await supabase
          .from("orders")
          .update({ status: target, ...(await computeExpectedDates(id)) })
          .eq("id", id);
        if (upErr) {
          failure = upErr.message;
          break;
        }
        done.push(id);
      }
    } else {
      const { error: upErr } = await supabase
        .from("orders")
        .update({ status: target })
        .in("id", ids);
      if (upErr) throw new Error(upErr.message);
      done.push(...ids);
    }

    if (done.length > 0) {
      await supabase.from("order_status_history").insert(
        done.map((id) => ({
          order_id: id,
          status: target,
          event_type: "status_change",
          note: done.length > 1 ? `Bulk update of ${done.length} orders` : null,
          changed_by: staff.id,
        }))
      );
      if (target === "details_received") {
        await Promise.all(done.map((id) => notifyOrder("details_received", id)));
      }
      revalidatePath("/orders");
      for (const id of done) revalidatePath(`/orders/${id}`);
    }

    // Report the partial truth rather than a clean success: the orders that
    // did move stay moved, and staff need to know which count is real.
    if (failure) {
      throw new Error(
        `Moved ${done.length} of ${ids.length} to ${label(target)} before this failed: ${failure}`
      );
    }

    return { status: target, count: done.length };
  });
}

/** Admin correction: move an order backward to an earlier stage with a reason. §4 */
export async function correctStatusBackward(
  orderId: string,
  targetStatus: StatusCode,
  reason: string
): Promise<ActionResult<void>> {
  return run(async () => {
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
  });
}

/** Cancel an order (reachable before shipped) with a required reason. §4 */
export async function cancelOrder(
  orderId: string,
  reason: string
): Promise<ActionResult<void>> {
  return run(async () => {
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
  });
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
): Promise<ActionResult<void>> {
  return run(async () => {
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

    await notifyOrder("shipped", orderId);

    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
  });
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
): Promise<ActionResult<{ attempts: number }>> {
  return run(async () => {
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

    // Highest-priority send in the system: every recovered attempt is a saved
    // sale, so this template defaults to enabled (§10).
    await notifyOrder("failed_attempt", orderId, { attempt: attempts });

    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
    return { attempts };
  });
}

/**
 * shipped → delivered, with the COD outcome (§4/§11). `codCollected` marks
 * payment_status; an uncollected delivery stays 'unpaid' for the ledger.
 */
export async function markDelivered(
  orderId: string,
  codCollected: boolean,
  note?: string
): Promise<ActionResult<void>> {
  return run(async () => {
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

    await notifyOrder("delivered", orderId);

    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
  });
}

/** Toggle the COD payment status on a delivered order (§8). */
export async function setPaymentStatus(
  orderId: string,
  paid: boolean
): Promise<ActionResult<void>> {
  return run(async () => {
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
  });
}

/**
 * Mark an order returned to sender (§4). Reachable from `shipped` — normally
 * after 3 failed attempts, but staff may return earlier (e.g. bad address).
 * A lost sale: recorded with returned_at + reason for the §11 ledger.
 */
export async function markReturned(
  orderId: string,
  reason: string
): Promise<ActionResult<void>> {
  return run(async () => {
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
  });
}

/**
 * Edit one item's details after the order exists.
 *
 * Staff intake stores the customer's reply verbatim, so the boxes on the
 * printable PSA form start empty. This is where they get filled — at print
 * time, with the pasted reply on screen to copy from.
 */
export async function updateOrderItemDetails(
  itemId: string,
  input: { form_details?: Record<string, string>; pasted_details?: string }
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireStaff();
    const parsed = z
      .object({
        form_details: z.record(z.string(), z.string()).optional(),
        pasted_details: z.string().max(20000).optional(),
      })
      .parse(input);

    const supabase = createClient();
    const { data: item, error: readErr } = await supabase
      .from("order_items")
      .select("order_id, services ( form_fields )")
      .eq("id", itemId)
      .single();
    if (readErr) throw new Error(readErr.message);

    const patch: Record<string, unknown> = {};

    if (parsed.form_details) {
      // Only keys this service actually declares — no arbitrary keys in jsonb.
      const rel = (item as any).services;
      const svc = Array.isArray(rel) ? rel[0] : rel;
      const allowed = new Set(
        ((svc?.form_fields ?? []) as { key: string }[]).map((f) => f.key)
      );
      const details: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.form_details)) {
        if (allowed.has(k) && v.trim()) details[k] = v.trim();
      }
      patch.form_details = details;
    }
    if (parsed.pasted_details !== undefined) {
      patch.pasted_details = parsed.pasted_details.trim() || null;
    }
    if (Object.keys(patch).length === 0) return;

    const { error } = await supabase
      .from("order_items")
      .update(patch)
      .eq("id", itemId);
    if (error) throw new Error(error.message);

    const orderId = (item as any).order_id;
    revalidatePath(`/orders/${orderId}`);
    revalidatePath(`/orders/${orderId}/print`);
  });
}
