"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/action-result";
import type { Tag, TagColor } from "@/lib/tags";

/**
 * Batch tags on customers.
 *
 * A batch is a decision staff make — this stack goes to the PSA counter today
 * — so nothing on the order records it. Tags do, and they are free-form
 * because only the business knows what its batches are called.
 *
 * RLS (migration 0022) decides which customers a scoped account may tag; these
 * actions do not re-implement that, they just report honestly when a write
 * comes back short.
 */


const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the tag a name")
  .max(40, "Keep the tag under 40 characters");

export async function listTags(): Promise<Tag[]> {
  await requireStaff();
  const supabase = createClient();
  const [{ data: tags, error }, { data: links }] = await Promise.all([
    supabase.from("tags").select("id, name, color").order("name"),
    supabase.from("customer_tags").select("tag_id"),
  ]);
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const l of links ?? []) {
    counts.set(l.tag_id, (counts.get(l.tag_id) ?? 0) + 1);
  }
  return (tags ?? []).map((t) => ({
    ...(t as { id: string; name: string; color: TagColor }),
    customer_count: counts.get(t.id) ?? 0,
  }));
}

/**
 * Create a tag, or hand back the one that already exists under that name.
 *
 * Staff type a batch name into the picker rather than managing a list first,
 * so "create" has to be safe to call with a name that is already taken —
 * otherwise typing an existing batch would fail instead of finding it.
 */
export async function createTag(
  name: string,
  color: TagColor = "slate"
): Promise<ActionResult<Tag>> {
  return run(async () => {
    const staff = await requireStaff();
    const parsed = nameSchema.parse(name);
    const supabase = createClient();

    const { data: existing } = await supabase
      .from("tags")
      .select("id, name, color")
      .ilike("name", parsed)
      .maybeSingle();
    if (existing) {
      return { ...(existing as any), customer_count: 0 } as Tag;
    }

    const { data, error } = await supabase
      .from("tags")
      .insert({ name: parsed, color, created_by: staff.id })
      .select("id, name, color")
      .single();
    if (error) {
      // Two staff creating the same batch at the same moment: the unique index
      // is the arbiter, and the loser should still get the tag.
      if (/duplicate key|unique/i.test(error.message)) {
        const { data: raced } = await supabase
          .from("tags")
          .select("id, name, color")
          .ilike("name", parsed)
          .maybeSingle();
        if (raced) return { ...(raced as any), customer_count: 0 } as Tag;
      }
      throw new Error(error.message);
    }
    revalidatePath("/customers");
    revalidatePath("/settings/tags");
    return { ...(data as any), customer_count: 0 } as Tag;
  });
}

export async function renameTag(
  id: string,
  name: string,
  color: TagColor
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireStaff();
    const parsed = nameSchema.parse(name);
    const supabase = createClient();
    const { error } = await supabase
      .from("tags")
      .update({ name: parsed, color })
      .eq("id", id);
    if (error) {
      if (/duplicate key|unique/i.test(error.message)) {
        throw new Error(`There is already a tag called "${parsed}".`);
      }
      throw new Error(error.message);
    }
    revalidatePath("/customers");
    revalidatePath("/orders");
    revalidatePath("/settings/tags");
  });
}

/** Delete a tag. It detaches from every customer — the rows cascade. */
export async function deleteTag(id: string): Promise<ActionResult<void>> {
  return run(async () => {
    await requireStaff();
    const supabase = createClient();
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/customers");
    revalidatePath("/orders");
    revalidatePath("/settings/tags");
  });
}

/**
 * Add or remove one tag across many customers — the whole point of the
 * feature, since a batch is a group.
 *
 * Adding is idempotent: re-tagging a customer who is already in the batch is
 * a no-op rather than an error, because staff re-select overlapping groups all
 * the time.
 */
export async function tagCustomers(
  customerIds: string[],
  tagId: string,
  mode: "add" | "remove"
): Promise<ActionResult<{ changed: number; skipped: number }>> {
  return run(async () => {
    const staff = await requireStaff();
    const ids = Array.from(new Set(customerIds.filter(Boolean)));
    if (ids.length === 0) throw new Error("Select at least one customer first.");
    if (!tagId) throw new Error("Pick a tag first.");

    const supabase = createClient();

    if (mode === "remove") {
      const { data, error } = await supabase
        .from("customer_tags")
        .delete()
        .eq("tag_id", tagId)
        .in("customer_id", ids)
        .select("customer_id");
      if (error) throw new Error(error.message);
      revalidatePath("/customers");
      revalidatePath("/orders");
      return { changed: data?.length ?? 0, skipped: 0 };
    }

    const { data, error } = await supabase
      .from("customer_tags")
      .upsert(
        ids.map((customer_id) => ({
          customer_id,
          tag_id: tagId,
          added_by: staff.id,
        })),
        { onConflict: "customer_id,tag_id", ignoreDuplicates: true }
      )
      .select("customer_id");
    if (error) throw new Error(error.message);

    // A scoped account can be handed ids it may not touch; RLS drops those
    // rows silently, so say how many actually landed rather than implying all.
    const { count } = await supabase
      .from("customer_tags")
      .select("customer_id", { count: "exact", head: true })
      .eq("tag_id", tagId)
      .in("customer_id", ids);
    const landed = count ?? data?.length ?? 0;
    revalidatePath("/customers");
    revalidatePath("/orders");
    return { changed: landed, skipped: ids.length - landed };
  });
}

/** Replace one customer's tags outright — used by the customer screen. */
export async function setCustomerTags(
  customerId: string,
  tagIds: string[]
): Promise<ActionResult<void>> {
  return run(async () => {
    const staff = await requireStaff();
    const supabase = createClient();
    const wanted = Array.from(new Set(tagIds.filter(Boolean)));

    const { error: delErr } = await supabase
      .from("customer_tags")
      .delete()
      .eq("customer_id", customerId);
    if (delErr) throw new Error(delErr.message);

    if (wanted.length > 0) {
      const { error } = await supabase.from("customer_tags").insert(
        wanted.map((tag_id) => ({
          customer_id: customerId,
          tag_id,
          added_by: staff.id,
        }))
      );
      if (error) throw new Error(error.message);
    }
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    revalidatePath("/orders");
  });
}
