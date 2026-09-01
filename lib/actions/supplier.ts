"use server";

import { revalidatePath } from "next/cache";
import { run, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import type { RequirementFile } from "@/lib/actions/files";
import type { FormFieldDef } from "@/lib/types";

export interface SupplierQueueItem {
  item_id: string;
  service_name: string;
  service_code: string;
  quantity: number;
  /** The service's whole field schema, so a select's options are here too. */
  form_fields: FormFieldDef[];
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
  /** When this order entered its current stage — the ageing clock. */
  status_since: string | null;
  delayed_at: string | null;
  delay_reason: string | null;
  delay_files: RequirementFile[];
  customer_name: string;
  phone: string | null;
  messenger_name: string | null;
  address_line: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  /** Notes the supplier has left for the office about this job. */
  notes: SupplierNote[];
  items: SupplierQueueItem[];
}

export interface SupplierNote {
  id: string;
  body: string;
  created_at: string;
  /** Set once a staff member has picked it up. */
  addressed_at: string | null;
  /** Only the office view carries who wrote it and who cleared it. */
  author_name?: string | null;
  addressed_by_name?: string | null;
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

/**
 * Flag a job as held up, and say why.
 *
 * The reason is shown to the customer on their tracking page — they are the
 * one waiting, and the supplier is the only one who knows. An empty reason
 * lifts the flag, so "moving again" needs no second button.
 */
export async function markDelayed(
  orderId: string,
  reason: string
): Promise<ActionResult<string>> {
  return run(async () => {
    const staff = await requireStaff();
    if (staff.role !== "supplier") {
      throw new Error("This is the supplier's action.");
    }
    const supabase = createClient();
    const { data, error } = await supabase.rpc("supplier_mark_delayed", {
      p_order: orderId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/queue");
    return (data ?? "") as string;
  });
}

/**
 * The supplier leaving the office a note about a job.
 *
 * Distinct from a delay: a delay speaks to the customer, this speaks to the
 * staff who handle TIN and PhilHealth — "short a birthdate", "the ID photo is
 * unreadable". Written on any job the supplier holds, whether it is waiting or
 * already in progress.
 */
export async function addSupplierNote(
  orderId: string,
  body: string
): Promise<ActionResult<SupplierNote>> {
  return run(async () => {
    const staff = await requireStaff();
    if (staff.role !== "supplier") {
      throw new Error("This is the supplier's action.");
    }
    const supabase = createClient();
    const { data, error } = await supabase.rpc("supplier_add_note", {
      p_order: orderId,
      p_body: body,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/queue");
    return data as SupplierNote;
  });
}

/**
 * The office marking a supplier's note handled.
 *
 * It stays on the order as a record of what was raised, but stops flagging the
 * board — the point of the flag is the ones nobody has looked at yet.
 */
export async function resolveSupplierNote(
  noteId: string
): Promise<ActionResult<void>> {
  return run(async () => {
    const staff = await requireStaff();
    if (staff.role === "supplier") {
      throw new Error("Only the office marks a note handled.");
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("supplier_notes")
      .update({ addressed_at: new Date().toISOString(), addressed_by: staff.id })
      .eq("id", noteId);
    if (error) throw new Error(error.message);
    revalidatePath("/orders");
  });
}

/** Re-open a note the office cleared too soon. */
export async function reopenSupplierNote(
  noteId: string
): Promise<ActionResult<void>> {
  return run(async () => {
    const staff = await requireStaff();
    if (staff.role === "supplier") {
      throw new Error("Only the office changes a note's state.");
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("supplier_notes")
      .update({ addressed_at: null, addressed_by: null })
      .eq("id", noteId);
    if (error) throw new Error(error.message);
    revalidatePath("/orders");
  });
}

/** The office reading an order's supplier notes, newest concern first. */
export async function supplierNotesForOrder(
  orderId: string
): Promise<SupplierNote[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("supplier_notes")
    .select(
      "id, body, created_at, addressed_at, author:created_by ( name ), resolver:addressed_by ( name )"
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((n: any) => ({
    id: n.id,
    body: n.body,
    created_at: n.created_at,
    addressed_at: n.addressed_at,
    author_name: n.author?.name ?? null,
    addressed_by_name: n.resolver?.name ?? null,
  }));
}
