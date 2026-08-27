"use server";

import { run, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import type { Customer } from "@/lib/types";

const customerSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional().nullable(),
  messenger_name: z.string().trim().optional().nullable(),
  messenger_link: z.string().trim().optional().nullable(),
  address_line: z.string().trim().optional().nullable(),
  barangay: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  province: z.string().trim().optional().nullable(),
  zip: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export type CustomerInput = z.infer<typeof customerSchema>;

/** Search customers by name or phone (for the new-order "pick existing" step). */
export async function searchCustomers(query: string): Promise<ActionResult<Customer[]>> {
  return run(async () => {
    await requireStaff();
    const supabase = createClient();
    const q = query.trim();
    let builder = supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    if (q) {
      builder = builder.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
    }
    const { data, error } = await builder;
    if (error) throw new Error(error.message);
    return (data ?? []) as Customer[];
  });
}

export async function createCustomer(
  input: CustomerInput
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    await requireStaff();
    const parsed = customerSchema.parse(input);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("customers")
      .insert(parsed)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    revalidatePath("/customers");
    return { id: data.id };
  });
}
