import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhPhone } from "@/lib/sms/phone";
import { notifyOrder } from "@/lib/sms/notify";
import type { FormFieldDef } from "@/lib/types";
import { joinLabels, missingRequiredLabels } from "@/lib/required-fields";

/**
 * Create an order from the public self-service form.
 *
 * Runs with the service-role key, so it is the trust boundary for everything
 * the browser sent. Two rules matter most:
 *
 *   1. Prices are read from the database, never from the payload. The client
 *      is told what a service costs, but the amount recorded on the order is
 *      whatever `services.price` says at submit time.
 *   2. Only fields declared in that service's own form_fields are stored, so a
 *      crafted payload can't stuff arbitrary keys into form_details.
 */

const itemSchema = z.object({
  service_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(10).default(1),
  form_details: z.record(z.string(), z.string()).default({}),
});

export const publicOrderSchema = z.object({
  full_name: z.string().trim().min(2, "Please enter your full name").max(120),
  phone: z.string().trim().min(7, "Please enter your mobile number"),
  messenger_name: z.string().trim().max(120).optional().default(""),
  address_line: z.string().trim().min(3, "Please enter your street address").max(200),
  // Couriers sort on the barangay — an address without one is a returned
  // parcel, so it is as required as the city.
  barangay: z.string().trim().min(2, "Please enter your barangay").max(120),
  city: z.string().trim().min(2, "Please enter your city or municipality").max(120),
  province: z.string().trim().min(2, "Please enter your province").max(120),
  zip: z.string().trim().max(10).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
  items: z.array(itemSchema).min(1, "Please choose at least one document").max(6),
});

export type PublicOrderInput = z.infer<typeof publicOrderSchema>;

export type SubmitResult =
  | { ok: true; trackingCode: string }
  | { ok: false; error: string };

const MAX_FIELD_LEN = 200;

export async function submitPublicOrder(
  input: PublicOrderInput
): Promise<SubmitResult> {
  const db = createAdminClient();

  const phone = normalizePhPhone(input.phone);
  if (!phone) {
    return { ok: false, error: "Please enter a valid PH mobile number." };
  }

  // --- Resolve services from the DB. Prices come from here, not the client. ---
  const ids = Array.from(new Set(input.items.map((i) => i.service_id)));
  const { data: services, error: svcErr } = await db
    .from("services")
    .select("id, name, price, form_fields, active")
    .in("id", ids);
  if (svcErr) return { ok: false, error: "Could not load the document list." };

  const byId = new Map((services ?? []).map((s) => [s.id, s]));
  for (const item of input.items) {
    const svc = byId.get(item.service_id);
    if (!svc || !svc.active) {
      return { ok: false, error: "One of the documents is no longer available." };
    }
  }

  // --- Required fields, before a single row is written -----------------------
  // The form marks them with an asterisk, but a browser is not a limit: this
  // route is a public endpoint and a crafted payload reaches it directly. The
  // order lands straight in Details Received, so the same rule the office is
  // held to applies here.
  {
    const gaps = input.items.map((item) => {
      const svc = byId.get(item.service_id)!;
      const allowed = new Set(
        ((svc.form_fields ?? []) as FormFieldDef[]).map((f) => f.key)
      );
      const details: Record<string, string> = {};
      for (const [k, v] of Object.entries(item.form_details)) {
        if (allowed.has(k) && typeof v === "string") details[k] = v;
      }
      return {
        serviceName: svc.name,
        labels: missingRequiredLabels(
          (svc.form_fields ?? []) as FormFieldDef[],
          details
        ),
      };
    });
    const incomplete = gaps.filter((g) => g.labels.length > 0);
    if (incomplete.length > 0) {
      return {
        ok: false,
        error:
          "Please fill in " +
          incomplete
            .map((g) => `${g.serviceName}: ${joinLabels(g.labels)}`)
            .join("; ") +
          ".",
      };
    }
  }

  // --- Customer ---
  const { data: customer, error: custErr } = await db
    .from("customers")
    .insert({
      full_name: input.full_name,
      phone,
      messenger_name: input.messenger_name || null,
      address_line: input.address_line,
      barangay: input.barangay,
      city: input.city,
      province: input.province,
      zip: input.zip || null,
      notes: input.notes ? `Customer note: ${input.notes}` : null,
    })
    .select("id")
    .single();
  if (custErr || !customer) {
    return { ok: false, error: "Could not save your details. Please try again." };
  }

  // --- Order. Lands in details_received: the customer filled the form. ---
  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      customer_id: customer.id,
      status: "details_received",
      source: "public",
    })
    .select("id, tracking_code")
    .single();
  if (orderErr || !order) {
    return { ok: false, error: "Could not create your order. Please try again." };
  }

  // --- Items: whitelist keys against each service's own form_fields ---
  const rows = input.items.map((item) => {
    const svc = byId.get(item.service_id)!;
    const allowed = new Set(
      ((svc.form_fields ?? []) as FormFieldDef[]).map((f) => f.key)
    );
    const details: Record<string, string> = {};
    for (const [k, v] of Object.entries(item.form_details)) {
      if (allowed.has(k) && typeof v === "string" && v.trim()) {
        details[k] = v.trim().slice(0, MAX_FIELD_LEN);
      }
    }
    return {
      order_id: order.id,
      service_id: item.service_id,
      quantity: item.quantity,
      price_at_order: svc.price, // authoritative, from the DB
      form_details: details,
    };
  });

  const { error: itemsErr } = await db.from("order_items").insert(rows);
  if (itemsErr) {
    // Don't leave a total-less orphan behind if the items fail.
    await db.from("orders").delete().eq("id", order.id);
    await db.from("customers").delete().eq("id", customer.id);
    return { ok: false, error: "Could not save your documents. Please try again." };
  }

  await db.from("order_status_history").insert({
    order_id: order.id,
    status: "details_received",
    event_type: "status_change",
    note: "Submitted by the customer through the online form",
    changed_by: null,
  });

  // Confirmation SMS + tracking link, honouring the owner's toggle.
  await notifyOrder("details_received", order.id);

  return { ok: true, trackingCode: order.tracking_code };
}
