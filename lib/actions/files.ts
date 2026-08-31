"use server";

import { revalidatePath } from "next/cache";
import { run, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth";

export interface RequirementFile {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

const BUCKET = "requirements";
/** The bucket refuses more, but saying so here gives a better message. */
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PER_ITEM = 12;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

/** How long a view link lives. Long enough to open, short enough to be useless
 *  if it is forwarded or ends up in someone's history. */
const LINK_SECONDS = 300;

/**
 * May this caller touch this order item?
 *
 * Staff are answered by RLS — the read simply comes back empty for an order
 * outside their document scope. A supplier can read no table at all, so they
 * are answered by the function written for them. Either way the check runs as
 * the caller, before anything is done with the service-role key.
 */
async function assertCanUseItem(itemId: string): Promise<void> {
  const staff = await requireStaff();
  const supabase = createClient();

  if (staff.role === "supplier") {
    const admin = createAdminClient();
    const { data: item } = await admin
      .from("order_items")
      .select("order_id")
      .eq("id", itemId)
      .maybeSingle();
    if (!item) throw new Error("That document is no longer there.");
    const { data: ok } = await supabase.rpc("supplier_can_see_order", {
      p_order: item.order_id,
    });
    if (!ok) throw new Error("That document is not one of yours.");
    return;
  }

  const { data } = await supabase
    .from("order_items")
    .select("id")
    .eq("id", itemId)
    .maybeSingle();
  if (!data) throw new Error("That document is no longer there.");
}

/** May this caller touch this order? Same shape as the item check above. */
async function assertCanUseOrder(orderId: string): Promise<void> {
  const staff = await requireStaff();
  const supabase = createClient();

  if (staff.role === "supplier") {
    const { data: ok } = await supabase.rpc("supplier_can_see_order", {
      p_order: orderId,
    });
    if (!ok) throw new Error("That order is not one of yours.");
    return;
  }
  const { data } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();
  if (!data) throw new Error("That order is no longer there.");
}

/**
 * A photo to go with a delay — the queue slip, the office notice. Optional,
 * like everything else here; a delay can be a sentence with nothing attached.
 *
 * The supplier IS allowed to add these, unlike the requirements: they are the
 * one who saw whatever went wrong.
 */
export async function uploadDelayFile(
  orderId: string,
  fileName: string,
  mimeType: string,
  data: string
): Promise<ActionResult<RequirementFile>> {
  return run(async () => {
    const staff = await requireStaff();
    await assertCanUseOrder(orderId);

    if (!ALLOWED.has(mimeType)) {
      throw new Error(
        "Attach a photo (JPG, PNG, HEIC or WebP) or a PDF. Other file types are not accepted."
      );
    }
    const bytes = Buffer.from(data, "base64");
    if (bytes.length === 0) throw new Error("That file came through empty.");
    if (bytes.length > MAX_BYTES) {
      throw new Error(
        "That file is over 10MB. Send a photo of it rather than the original scan."
      );
    }

    const admin = createAdminClient();
    const { count } = await admin
      .from("order_delay_files")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);
    if ((count ?? 0) >= MAX_PER_ITEM) {
      throw new Error(
        `This delay already has ${MAX_PER_ITEM} photos — remove one first.`
      );
    }

    const ext = (fileName.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "bin").toLowerCase();
    const path = `${orderId}/delay/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: mimeType, upsert: false });
    if (upErr) throw new Error(upErr.message);

    // Written with the service key because a supplier can insert into no
    // table; the check above is what stands in for the policy.
    const { data: row, error } = await admin
      .from("order_delay_files")
      .insert({
        order_id: orderId,
        storage_path: path,
        file_name: fileName.slice(0, 200),
        mime_type: mimeType,
        size_bytes: bytes.length,
        uploaded_by: staff.id,
      })
      .select("id, file_name, mime_type, size_bytes, created_at")
      .single();
    if (error) {
      await admin.storage.from(BUCKET).remove([path]);
      throw new Error(error.message);
    }

    revalidatePath("/queue");
    revalidatePath(`/orders/${orderId}`);
    return row as RequirementFile;
  });
}

/** A short-lived link to a delay photo, for the office or the supplier. */
export async function delayFileUrl(
  fileId: string
): Promise<ActionResult<string>> {
  return run(async () => {
    const staff = await requireStaff();
    const supabase = createClient();
    const admin = createAdminClient();

    const { data: file } = await admin
      .from("order_delay_files")
      .select("storage_path, order_id")
      .eq("id", fileId)
      .maybeSingle();
    if (!file) throw new Error("That photo is no longer there.");

    if (staff.role === "supplier") {
      const { data: ok } = await supabase.rpc("supplier_can_see_delay_file", {
        p_file: fileId,
      });
      if (!ok) throw new Error("That photo is not one of yours.");
    } else {
      await assertCanUseOrder(file.order_id);
    }

    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_path, LINK_SECONDS);
    if (error || !data) throw new Error(error?.message ?? "Could not open that file.");
    return data.signedUrl;
  });
}

/**
 * Attach a requirement — an ID photo, a birth certificate — to one document.
 *
 * Always optional. Nothing anywhere checks that a file exists before an order
 * can move on; this only records what was sent.
 */
export async function uploadRequirement(
  itemId: string,
  orderId: string,
  fileName: string,
  mimeType: string,
  /** Base64, no data: prefix. */
  data: string
): Promise<ActionResult<RequirementFile>> {
  return run(async () => {
    const staff = await requireStaff();
    if (staff.role === "supplier") {
      throw new Error("Only the office can attach requirements.");
    }
    await assertCanUseItem(itemId);

    if (!ALLOWED.has(mimeType)) {
      throw new Error(
        "Attach a photo (JPG, PNG, HEIC or WebP) or a PDF. Other file types are not accepted."
      );
    }
    const bytes = Buffer.from(data, "base64");
    if (bytes.length === 0) throw new Error("That file came through empty.");
    if (bytes.length > MAX_BYTES) {
      throw new Error(
        "That file is over 10MB. Send a photo of it rather than the original scan."
      );
    }

    const supabase = createClient();
    const { count } = await supabase
      .from("order_item_files")
      .select("id", { count: "exact", head: true })
      .eq("order_item_id", itemId);
    if ((count ?? 0) >= MAX_PER_ITEM) {
      throw new Error(
        `That document already has ${MAX_PER_ITEM} attachments — remove one first.`
      );
    }

    // The name is the customer's, so it is never used as a path: a stray "/"
    // or "..", or two people sending "id.jpg", would collide or escape.
    const ext = (fileName.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "bin").toLowerCase();
    const path = `${orderId}/${itemId}/${crypto.randomUUID()}.${ext}`;

    const admin = createAdminClient();
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: mimeType, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: row, error } = await supabase
      .from("order_item_files")
      .insert({
        order_item_id: itemId,
        storage_path: path,
        file_name: fileName.slice(0, 200),
        mime_type: mimeType,
        size_bytes: bytes.length,
        uploaded_by: staff.id,
      })
      .select("id, file_name, mime_type, size_bytes, created_at")
      .single();
    if (error) {
      // Don't leave a file in the bucket that nothing points at.
      await admin.storage.from(BUCKET).remove([path]);
      throw new Error(error.message);
    }

    revalidatePath(`/orders/${orderId}`);
    return row as RequirementFile;
  });
}

/** A short-lived link to view one attachment. The bucket is private, so this
 *  is the only way in — for the office and for the supplier alike. */
export async function requirementUrl(
  fileId: string
): Promise<ActionResult<string>> {
  return run(async () => {
    const staff = await requireStaff();
    const supabase = createClient();
    const admin = createAdminClient();

    const { data: file } = await admin
      .from("order_item_files")
      .select("storage_path, order_item_id")
      .eq("id", fileId)
      .maybeSingle();
    if (!file) throw new Error("That attachment is no longer there.");

    if (staff.role === "supplier") {
      const { data: ok } = await supabase.rpc("supplier_can_see_file", {
        p_file: fileId,
      });
      if (!ok) throw new Error("That attachment is not one of yours.");
    } else {
      await assertCanUseItem(file.order_item_id);
    }

    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_path, LINK_SECONDS);
    if (error || !data) throw new Error(error?.message ?? "Could not open that file.");
    return data.signedUrl;
  });
}

export async function deleteRequirement(
  fileId: string,
  orderId: string
): Promise<ActionResult<void>> {
  return run(async () => {
    const staff = await requireStaff();
    if (staff.role === "supplier") {
      throw new Error("Only the office can remove an attachment.");
    }
    const supabase = createClient();
    const admin = createAdminClient();

    const { data: file } = await admin
      .from("order_item_files")
      .select("storage_path, order_item_id")
      .eq("id", fileId)
      .maybeSingle();
    if (!file) return;
    await assertCanUseItem(file.order_item_id);

    // The row goes first: it is what RLS protects, and a file left behind is a
    // tidy-up job rather than a leak.
    const { error } = await supabase
      .from("order_item_files")
      .delete()
      .eq("id", fileId);
    if (error) throw new Error(error.message);
    await admin.storage.from(BUCKET).remove([file.storage_path]);

    revalidatePath(`/orders/${orderId}`);
  });
}
