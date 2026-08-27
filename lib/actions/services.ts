"use server";

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
  type: z.enum(["text", "date", "number", "textarea"]),
  required: z.boolean(),
  synonyms: z.array(z.string().trim()).default([]),
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
): Promise<void> {
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
}

export async function createService(input: ServiceInput): Promise<void> {
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
): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase
    .from("services")
    .update({ active })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/services");
  revalidatePath("/orders/new");
}
