"use server";

import { run, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";

async function requireAdmin() {
  const staff = await requireStaff();
  if (staff.role !== "admin") {
    throw new Error("Only admins can change services and prices.");
  }
  return staff;
}

const formFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Field key is required")
    .regex(/^[a-z0-9_]+$/, "Key must be lowercase letters, numbers or underscores"),
  label: z.string().trim().min(1, "Field label is required"),
  type: z.enum(["text", "date", "number", "textarea", "select"]),
  required: z.boolean(),
  synonyms: z.array(z.string().trim()).default([]),
  // Passed through rather than edited here: a select's options carry meaning
  // the rest of the system reads (the ID verification fee keys off one of
  // them), so this screen must not quietly drop them when a price is changed.
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
});

const serviceSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .regex(/^[a-z0-9_]+$/, "Code must be lowercase letters, numbers or underscores"),
  name: z.string().trim().min(1, "Name is required"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  processing_days_min: z.coerce.number().int().min(0),
  processing_days_max: z.coerce.number().int().min(0),
  shipping_days_estimate: z.coerce.number().int().min(0),
  active: z.boolean(),
  form_fields: z.array(formFieldSchema).default([]),
});

export type ServiceInput = z.input<typeof serviceSchema>;

function validate(input: ServiceInput) {
  const parsed = serviceSchema.parse(input);
  if (parsed.processing_days_max < parsed.processing_days_min) {
    throw new Error("Max processing days cannot be less than the minimum.");
  }
  const keys = parsed.form_fields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) {
    throw new Error("Two form fields share the same key.");
  }
  return parsed;
}

/**
 * Update a service — including its price.
 *
 * Changing a price does NOT alter existing orders: each order_item snapshots
 * price_at_order when the order is encoded, and every sales figure is computed
 * from those snapshots. New prices apply only to orders encoded from now on.
 */
export async function updateService(
  id: string,
  input: ServiceInput
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const parsed = validate(input);

    const supabase = createClient();
    const { error } = await supabase
      .from("services")
      .update(parsed)
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/settings/services");
    revalidatePath("/orders/new");
  });
}

export async function createService(input: ServiceInput): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const parsed = validate(input);

    const supabase = createClient();
    const { error } = await supabase.from("services").insert(parsed);
    if (error) {
      if (/duplicate key|unique/i.test(error.message)) {
        throw new Error(`A service with code "${parsed.code}" already exists.`);
      }
      throw new Error(error.message);
    }

    revalidatePath("/settings/services");
    revalidatePath("/orders/new");
  });
}

/**
 * Enable/disable a service. Disabling hides it from the new-order screen but
 * leaves history intact — past orders keep their item and their snapshotted
 * price, so sales reporting is unaffected. There is deliberately no delete:
 * removing a service would orphan the order_items that reference it.
 */
export async function setServiceActive(
  id: string,
  active: boolean
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const supabase = createClient();
    const { error } = await supabase
      .from("services")
      .update({ active })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/settings/services");
    revalidatePath("/orders/new");
  });
}

/**
 * Move a service up or down the list.
 *
 * Order is a business decision that changes when a new document is added, so
 * it lives in the data and is edited here rather than needing a deploy. The
 * swap is between neighbours in the current order, so positions stay distinct
 * however the numbers were seeded.
 */
export async function moveService(
  id: string,
  direction: "up" | "down"
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const supabase = createClient();

    const { data: rows, error } = await supabase
      .from("services")
      .select("id, sort_order, name")
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const i = list.findIndex((s) => s.id === id);
    if (i === -1) throw new Error("That service no longer exists.");
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return; // already at the end — nothing to do

    // Rewrite both positions from the list index rather than swapping the
    // stored values, which would be a no-op wherever two rows share a number.
    const a = list[i];
    const b = list[j];
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("services").update({ sort_order: (j + 1) * 10 }).eq("id", a.id),
      supabase.from("services").update({ sort_order: (i + 1) * 10 }).eq("id", b.id),
    ]);
    if (e1 || e2) throw new Error((e1 ?? e2)!.message);

    revalidatePath("/settings/services");
    revalidatePath("/orders/new");
    revalidatePath("/order");
  });
}
