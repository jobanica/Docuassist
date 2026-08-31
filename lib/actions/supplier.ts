"use server";

import { revalidatePath } from "next/cache";
import { run, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import type { RequirementFile } from "@/lib/actions/files";

export interface SupplierQueueItem {
  item_id: string;
  service_name: string;
  service_code: string;
  quantity: number;
  form_fields: { key: string; label: string }[];
  form_details: Record<string, string> | null;
  pasted_details: string | null;
  /** The requirements the office attached — an ID, a birth certificate. */
  files: RequirementFile[];
}

export interface SupplierQueueRow {
  order_id: string;
  tracking_code: string;
  status: string;
  created_at: string;
  customer_name: string;
  phone: string | null;
  messenger_name: string | null;
  address_line: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  items: SupplierQueueItem[];
}

/**
 * The supplier's work list.
 *
 * Everything comes from one SECURITY DEFINER function rather than a query: a
 * supplier can read no table directly, so there is nowhere for a price to leak
 * from even if this page were changed carelessly later.
 */
export async function supplierQueue(): Promise<SupplierQueueRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("supplier_queue");
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierQueueRow[];
}

/**
 * Details Received -> Processing. The database enforces both halves of that —
 * that the caller is a supplier, and that the order is theirs and at the right
 * stage — so this cannot be widened by editing the page.
 */
export async function startProcessing(
  orderId: string
): Promise<ActionResult<void>> {
  return run(async () => {
    const staff = await requireStaff();
    if (staff.role !== "supplier") {
      throw new Error("This is the supplier's action. Use the order screen.");
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("supplier_start_processing", {
      p_order: orderId,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/queue");
  });
}
