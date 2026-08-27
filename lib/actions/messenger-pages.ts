"use server";

import { run, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import type { MessengerPage } from "@/lib/types";

/**
 * The Facebook pages a tracking link can point at.
 *
 * Reading is open to any staff member — the New Order screen needs the list to
 * offer the picker. Changing the list is admin-only: a wrong URL here sends
 * every future customer to the wrong inbox.
 */

async function requireAdmin() {
  const staff = await requireStaff();
  if (staff.role !== "admin") {
    throw new Error("Only admins can manage Facebook pages.");
  }
  return staff;
}

const pageSchema = z.object({
  name: z.string().trim().min(2, "Give the page a name").max(80),
  url: z
    .string()
    .trim()
    .url("Enter the full link, starting with https://")
    .max(500)
    .refine(
      (u) => /^https:\/\/([a-z0-9-]+\.)*(facebook\.com|fb\.com|m\.me|messenger\.com)\//i.test(u),
      "That doesn't look like a Facebook or Messenger link."
    ),
});

export async function listMessengerPages(): Promise<MessengerPage[]> {
  await requireStaff();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messenger_pages")
    .select("*")
    .order("is_default", { ascending: false })
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as MessengerPage[];
}

export async function createMessengerPage(input: {
  name: string;
  url: string;
}): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const parsed = pageSchema.parse(input);
    const supabase = createClient();

    // The very first page becomes the default — otherwise nothing would resolve.
    const { count } = await supabase
      .from("messenger_pages")
      .select("id", { count: "exact", head: true });

    const { error } = await supabase.from("messenger_pages").insert({
      ...parsed,
      is_default: (count ?? 0) === 0,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/settings/business");
  });
}

export async function updateMessengerPage(
  id: string,
  input: { name: string; url: string }
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const parsed = pageSchema.parse(input);
    const supabase = createClient();
    const { error } = await supabase
      .from("messenger_pages")
      .update(parsed)
      .eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings/business");
  });
}

export async function setDefaultMessengerPage(id: string): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const supabase = createClient();
    // Clear first: the partial unique index rejects a second default outright.
    const { error: clearErr } = await supabase
      .from("messenger_pages")
      .update({ is_default: false })
      .eq("is_default", true);
    if (clearErr) throw new Error(clearErr.message);

    const { error } = await supabase
      .from("messenger_pages")
      .update({ is_default: true, active: true })
      .eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings/business");
  });
}

export async function setMessengerPageActive(
  id: string,
  active: boolean
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const supabase = createClient();

    if (!active) {
      const { data } = await supabase
        .from("messenger_pages")
        .select("is_default")
        .eq("id", id)
        .maybeSingle();
      if (data?.is_default) {
        throw new Error(
          "This is the default page — make another one the default first."
        );
      }
    }

    const { error } = await supabase
      .from("messenger_pages")
      .update({ active })
      .eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings/business");
  });
}

/** Change which page an existing order's tracking link points at. */
export async function setOrderMessengerPage(
  orderId: string,
  pageId: string | null
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireStaff();
    const supabase = createClient();
    const { error } = await supabase
      .from("orders")
      .update({ messenger_page_id: pageId })
      .eq("id", orderId);
    if (error) throw new Error(error.message);
    revalidatePath(`/orders/${orderId}`);
  });
}
