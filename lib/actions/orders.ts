"use server";

import { run, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import {
  missingFieldsMessage,
  missingRequiredLabels,
} from "@/lib/required-fields";
import { clampDiscount, peso } from "@/lib/money";
import { shippingFee } from "@/lib/actions/settings";
import { nameCheckKey } from "@/lib/parse/surname";
import { missingIdNumber, verificationCount } from "@/lib/id-verification";
import { idVerificationFee } from "@/lib/actions/settings";
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
  /** Set when staff accepted the parents'-surname warning while encoding —
   *  the names are right and this says why. Empty means not accepted. */
  name_check_ack_reason: z.string().max(200).default(""),
});

const createOrderSchema = z.object({
  customer_id: z.string().uuid(),
  /** Taken off the whole order. Regulars ask; this is where it goes. */
  discount_amount: z.coerce.number().min(0).default(0),
  discount_reason: z.string().max(200).default(""),
  initial_status: z.enum(["new_inquiry", "details_received"]),
  /** Facebook page the tracking link points at. Null falls back to the
   *  business default when the page is rendered. */
  messenger_page_id: z.string().uuid().nullable().default(null),
  items: z.array(orderItemSchema).min(1, "Add at least one service"),
});

export type CreateOrderInput = z.input<typeof createOrderSchema>;


/**
 * Stop an order claiming its details are complete when they are not.
 *
 * "Details received" is a promise to the customer and an instruction to
 * whoever works the order next, so the fields the form marks with an asterisk
 * have to actually be there by the time it is made. Before that — a stub
 * raised while the customer is still replying — nothing is checked, because
 * that is exactly what the stub is for.
 */
async function assertItemsComplete(
  items: { service_id: string; form_details: Record<string, string> }[]
): Promise<void> {
  const ids = Array.from(new Set(items.map((i) => i.service_id)));
  if (ids.length === 0) return;

  const supabase = createClient();
  const { data: services, error } = await supabase
    .from("services")
    .select("id, code, name, form_fields")
    .in("id", ids);
  if (error) throw new Error(error.message);

  const byId = new Map((services ?? []).map((s: any) => [s.id, s]));
  const gaps = items.map((it) => {
    const svc = byId.get(it.service_id);
    return {
      serviceName: svc?.name ?? "Document",
      labels: missingRequiredLabels(svc?.form_fields ?? [], it.form_details),
    };
  });

  const message = missingFieldsMessage(gaps);
  if (message) throw new Error(message);

  // The account number is only wanted once the customer says they have the
  // account and know it — so it cannot be a required field, and is checked
  // here instead. Without it the supplier has an existing account and no way
  // to reach it, which is the one case the whole question exists to avoid.
  const noNumber = items
    .filter((it) => missingIdNumber(byId.get(it.service_id)?.code ?? "", it.form_details))
    .map((it) => byId.get(it.service_id)?.name ?? "Document");
  if (noNumber.length > 0) {
    throw new Error(
      `${noNumber.join(" and ")}: the customer said they already have an account, so the number is needed. If they cannot find it, change the answer to “number unknown” — that adds the verification fee and the supplier looks it up.`
    );
  }
}

/** The same check for an order already saved, read back from the database. */
async function assertOrderComplete(orderId: string): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select("service_id, form_details")
    .eq("order_id", orderId);
  if (error) throw new Error(error.message);
  await assertItemsComplete(
    (data ?? []).map((r: any) => ({
      service_id: r.service_id,
      form_details: (r.form_details ?? {}) as Record<string, string>,
    }))
  );
}

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

      // And the document's own required fields — a birth certificate with no
      // birthdate cannot be filed.
      await assertItemsComplete(parsed.items);
    }

    // A discount cannot be larger than the order it comes off — a slipped
    // keystroke should not turn a sale into a refund. The verification fee is
    // part of what is owed, so it is part of what can be discounted; the
    // database works the total out the same way.
    const subtotal =
      parsed.items.reduce((sum, it) => sum + it.price_at_order * it.quantity, 0) +
      verificationCount(parsed.items) * (await idVerificationFee());
    const discount = clampDiscount(parsed.discount_amount, subtotal);

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
        // total_amount follows from the items and this, in the database.
        discount_amount: discount,
        discount_reason: parsed.discount_reason.trim() || null,
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
        // Pinned to the names it was given for, so a later edit re-opens the
        // check rather than inheriting an acceptance meant for other names.
        ...(it.name_check_ack_reason.trim()
          ? {
              name_check_ack_key: nameCheckKey(it.form_details),
              name_check_ack_reason: it.name_check_ack_reason.trim(),
              name_check_ack_at: new Date().toISOString(),
              name_check_ack_by: staff.id,
            }
          : {}),
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

    // The gate is the same at both ends of Details Received: an order may not
    // arrive there, nor leave it for Processing, with required fields blank.
    // The second half is what catches orders saved before this was enforced.
    if (target === "details_received" || current === "details_received") {
      await assertOrderComplete(orderId);
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

    // Same gate as one at a time, checked across the whole selection before
    // anything is written: a batch that half-moved would be worse than one
    // that did not move at all, and the board would not show which half.
    if (target === "details_received" || current === "details_received") {
      const incomplete: string[] = [];
      for (const id of ids) {
        try {
          await assertOrderComplete(id);
        } catch {
          incomplete.push(id);
        }
      }
      if (incomplete.length > 0) {
        const { data: codes } = await supabase
          .from("orders")
          .select("tracking_code")
          .in("id", incomplete);
        const list = (codes ?? []).map((c: any) => c.tracking_code).join(", ");
        throw new Error(
          `${incomplete.length} of those orders still have required details blank (${list}). ` +
            `Open each one and fill them in. Nothing was changed.`
        );
      }
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

/**
 * "The names are right" — recorded, with a reason.
 *
 * The parents'-surname rule is a warning, not a law, and one of its false
 * alarms is ordinary here: unmarried parents, so the child is registered under
 * the mother's surname with the father still named on the certificate. Staff
 * knowing that had nowhere to put it — the warning came back on every visit,
 * and the board listed the order among the ones still to check.
 *
 * The names are stored with the acceptance rather than a bare flag. Change one
 * of them afterwards and the key no longer matches, so the check runs again on
 * the new names instead of inheriting a blessing meant for the old ones.
 */
export async function acceptNameCheck(
  itemId: string,
  reason: string
): Promise<ActionResult<void>> {
  return run(async () => {
    const staff = await requireStaff();
    const text = z.string().trim().min(1, "Say why the names are right")
      .max(200).parse(reason);

    const supabase = createClient();
    const { data: item, error: readErr } = await supabase
      .from("order_items")
      .select("order_id, form_details")
      .eq("id", itemId)
      .single();
    if (readErr) throw new Error(readErr.message);

    const details = (item.form_details ?? {}) as Record<string, string>;
    const { error } = await supabase
      .from("order_items")
      .update({
        name_check_ack_key: nameCheckKey(details),
        name_check_ack_reason: text,
        name_check_ack_at: new Date().toISOString(),
        name_check_ack_by: staff.id,
      })
      .eq("id", itemId);
    if (error) throw new Error(error.message);

    // Kept in the order's own history so the decision has a name and a date
    // against it later. Notes stay out of the customer's timeline.
    await supabase.from("order_status_history").insert({
      order_id: item.order_id,
      event_type: "note",
      note: `Name check accepted — ${text}`,
      changed_by: staff.id,
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/${item.order_id}`);
  });
}

/** Undo an acceptance — the warning comes back, on the board too. */
export async function undoNameCheck(itemId: string): Promise<ActionResult<void>> {
  return run(async () => {
    await requireStaff();
    const supabase = createClient();
    const { data: item, error: readErr } = await supabase
      .from("order_items")
      .select("order_id")
      .eq("id", itemId)
      .single();
    if (readErr) throw new Error(readErr.message);

    const { error } = await supabase
      .from("order_items")
      .update({
        name_check_ack_key: null,
        name_check_ack_reason: null,
        name_check_ack_at: null,
        name_check_ack_by: null,
      })
      .eq("id", itemId);
    if (error) throw new Error(error.message);

    revalidatePath("/orders");
    revalidatePath(`/orders/${item.order_id}`);
  });
}

/**
 * A discount off the whole order.
 *
 * Regulars ask, and the answer used to be to edit the price on the document
 * itself — which rewrites what that document costs and leaves the per-service
 * report saying a birth certificate earns ₱585 some days and ₱685 others. This
 * keeps the price of the document and the favour done for the customer as two
 * separate figures, with the reason beside the second one.
 *
 * The total follows in the database, so the tracking page, the COD reminder,
 * the SMS and the dashboard all move together.
 */
export async function setOrderDiscount(
  orderId: string,
  amount: number,
  reason: string
): Promise<ActionResult<{ discount: number; total: number }>> {
  return run(async () => {
    const staff = await requireStaff();
    const parsed = z
      .object({
        amount: z.coerce.number().min(0, "A discount cannot be negative"),
        reason: z.string().max(200).default(""),
      })
      .parse({ amount, reason });

    const supabase = createClient();
    const { data: order, error: readErr } = await supabase
      .from("orders")
      .select(
        "status, discount_amount, order_items ( price_at_order, quantity, form_details )"
      )
      .eq("id", orderId)
      .single();
    if (readErr) throw new Error(readErr.message);

    // Money already collected is not ours to rewrite; a returned or cancelled
    // order has nothing left to discount either.
    if (["delivered", "returned", "cancelled"].includes(order.status as string)) {
      throw new Error(
        "This order is already closed — a discount can only be given while it is still in progress."
      );
    }

    const subtotal =
      (order.order_items ?? []).reduce(
        (sum: number, it: any) => sum + Number(it.price_at_order) * it.quantity,
        0
      ) +
      verificationCount(order.order_items ?? []) * (await idVerificationFee());
    const discount = clampDiscount(parsed.amount, subtotal);
    const wasGiven = Number(order.discount_amount) > 0;

    const { data: saved, error } = await supabase
      .from("orders")
      .update({
        discount_amount: discount,
        discount_reason: discount > 0 ? parsed.reason.trim() || null : null,
      })
      .eq("id", orderId)
      .select("total_amount")
      .single();
    if (error) throw new Error(error.message);

    // Kept in the order's history: a discount is money, and money that moved
    // should say who moved it. Notes stay out of the customer's timeline.
    await supabase.from("order_status_history").insert({
      order_id: orderId,
      event_type: "note",
      note:
        discount > 0
          ? `Discount ${peso(discount)}${
              parsed.reason.trim() ? ` — ${parsed.reason.trim()}` : ""
            }`
          : wasGiven
            ? "Discount removed"
            : "Discount set to zero",
      changed_by: staff.id,
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/dashboard");
    return { discount, total: Number(saved.total_amount) };
  });
}

/**
 * Two orders for one person, made into one job.
 *
 * The same customer orders a death certificate on Monday and another on
 * Friday. One processor handles both, one trip to the PSA, one parcel — so
 * carrying them as two orders means two tracking links to explain and two
 * shipping fees to eat.
 *
 * The documents move onto the earliest of the selected orders, which keeps its
 * tracking code. The others are pointed at it rather than deleted: the
 * customer already has those links, and a link that answers "not found" is
 * worse than no link at all. Each absorbed code keeps working and now shows
 * the combined order.
 *
 * `total` is what the combined order should cost. Staff usually knock
 * something off for the bundle — that difference is recorded as the order's
 * discount, so the documents keep their own prices and the per-service report
 * still says what a death certificate earns.
 */
export async function combineOrders(
  orderIds: string[],
  total?: number
): Promise<ActionResult<{ id: string; tracking_code: string; total: number }>> {
  return run(async () => {
    const staff = await requireStaff();
    const ids = Array.from(new Set(orderIds.filter(Boolean)));
    if (ids.length < 2) {
      throw new Error("Pick at least two orders to combine.");
    }

    const supabase = createClient();
    const { data: rows, error } = await supabase
      .from("orders")
      .select(
        `id, tracking_code, status, customer_id, created_at, merged_into,
         discount_amount, customers ( full_name ),
         order_items ( id, price_at_order, quantity, form_details )`
      )
      .in("id", ids)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // A scoped account may not see every id the browser sent, and an order can
    // move in another tab while the boxes are being ticked.
    if (!rows || rows.length !== ids.length) {
      throw new Error(
        "Some of those orders are no longer available — refresh the board and select again. Nothing was changed."
      );
    }

    const names = Array.from(
      new Set(rows.map((r: any) => r.customer_id).filter(Boolean))
    );
    if (names.length > 1) {
      throw new Error(
        "Those orders belong to different customers. Combining is for one person's documents going in one parcel."
      );
    }
    if (rows.some((r: any) => r.merged_into)) {
      throw new Error(
        "One of those was already combined into another order. Refresh the board and try again."
      );
    }

    // Combining is about what ships together, so it stops at the point where
    // shipping is arranged: after that there is a courier and a tracking
    // number per parcel, and the parcels are already separate.
    const tooLate = rows.filter((r: any) =>
      ["shipped", "delivered", "returned", "cancelled"].includes(r.status)
    );
    if (tooLate.length > 0) {
      throw new Error(
        `${tooLate
          .map((r: any) => r.tracking_code)
          .join(" and ")} ${
          tooLate.length === 1 ? "has" : "have"
        } already left the office, so there is nothing left to combine. Orders can be combined up to Released.`
      );
    }

    // The oldest keeps its code: it is the link the customer has had longest,
    // and the one they are most likely to have saved.
    const keeper = rows[0] as any;
    const absorbed = rows.slice(1) as any[];

    // The combined job can only be as far along as its least advanced part —
    // a parcel does not go out because two of its three documents are ready.
    const behind = rows
      .map((r: any) => PIPELINE.indexOf(r.status))
      .reduce((a, b) => Math.min(a, b), PIPELINE.length);
    const status = PIPELINE[behind] as StatusCode;

    const { error: moveErr } = await supabase
      .from("order_items")
      .update({ order_id: keeper.id })
      .in(
        "id",
        absorbed.flatMap((o) => (o.order_items ?? []).map((i: any) => i.id))
      );
    if (moveErr) throw new Error(moveErr.message);

    const verifyFee = await idVerificationFee();
    const subtotal = rows.reduce(
      (sum: number, o: any) =>
        sum +
        (o.order_items ?? []).reduce(
          (s: number, i: any) => s + Number(i.price_at_order) * i.quantity,
          0
        ) +
        verificationCount(o.order_items ?? []) * verifyFee,
      0
    );
    // Every price is the document plus one trip to the customer, so documents
    // that travel together owe one delivery between them. That is the whole
    // reason the price changes on combining, and it is the figure staff would
    // otherwise work out by hand every time.
    const docs = rows.reduce(
      (n: number, o: any) =>
        n + (o.order_items ?? []).reduce((k: number, i: any) => k + i.quantity, 0),
      0
    );
    const saved = Math.max(docs - 1, 0) * (await shippingFee());
    const promised = rows.reduce(
      (s: number, o: any) => s + Number(o.discount_amount),
      0
    );
    const asked = total === undefined ? subtotal - promised - saved : total;
    const discount = clampDiscount(subtotal - asked, subtotal);

    const { data: kept, error: keepErr } = await supabase
      .from("orders")
      .update({
        status,
        discount_amount: discount,
        discount_reason:
          discount > 0
            ? `Combined ${rows.length} orders into one parcel`
            : null,
      })
      .eq("id", keeper.id)
      .select("total_amount")
      .single();
    if (keepErr) throw new Error(keepErr.message);

    const { error: mergeErr } = await supabase
      .from("orders")
      .update({
        merged_into: keeper.id,
        // Nothing left to discount, and nothing left to be held up about.
        discount_amount: 0,
        discount_reason: null,
        delayed_at: null,
        delay_reason: null,
      })
      .in(
        "id",
        absorbed.map((o) => o.id)
      );
    if (mergeErr) throw new Error(mergeErr.message);

    const codes = absorbed.map((o) => o.tracking_code).join(", ");
    await supabase.from("order_status_history").insert([
      {
        order_id: keeper.id,
        event_type: "note",
        note: `Combined with ${codes} — one parcel, ${peso(
          Number(kept.total_amount)
        )}`,
        changed_by: staff.id,
      },
      ...absorbed.map((o) => ({
        order_id: o.id,
        event_type: "note",
        note: `Combined into ${keeper.tracking_code}. This link now follows that order.`,
        changed_by: staff.id,
      })),
    ]);

    revalidatePath("/orders");
    revalidatePath(`/orders/${keeper.id}`);
    revalidatePath("/dashboard");
    return {
      id: keeper.id,
      tracking_code: keeper.tracking_code,
      total: Number(kept.total_amount),
    };
  });
}
