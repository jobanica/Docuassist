"use server";

import { run, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth";

/**
 * Staff account management, admin only.
 *
 * Creating a login needs the Supabase Auth admin API, which requires the
 * service-role key — so these actions check the caller's role themselves
 * before touching it, rather than relying on RLS (the service key bypasses
 * RLS entirely).
 *
 * Two lockout guards run on every change:
 *   - you cannot demote or deactivate yourself
 *   - you cannot remove the last active admin
 * Without them a single click could leave the business with no way in.
 */

async function requireAdmin() {
  const staff = await requireStaff();
  if (staff.role !== "admin") {
    throw new Error("Only admins can manage staff accounts.");
  }
  return staff;
}

/** Number of active admins other than `excludingId`. */
async function otherActiveAdmins(excludingId: string): Promise<number> {
  const db = createAdminClient();
  const { count } = await db
    .from("staff_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("active", true)
    .neq("id", excludingId);
  return count ?? 0;
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Enter the staff member's name").max(120),
  email: z.string().trim().email("Enter a valid email address").max(200),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200),
  role: z.enum(["admin", "staff", "supplier"]),
});

export type CreateStaffInput = z.infer<typeof createSchema>;

export async function createStaffAccount(
  input: CreateStaffInput
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const parsed = createSchema.parse(input);
    const db = createAdminClient();

    const { data: created, error } = await db.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true, // no inbox round-trip; the admin hands over the password
    });

    if (error) {
      if (/already been registered|already exists/i.test(error.message)) {
        throw new Error("That email already has an account.");
      }
      throw new Error(error.message);
    }

    const { error: rowErr } = await db.from("staff_users").insert({
      id: created.user.id,
      name: parsed.name,
      email: parsed.email,
      role: parsed.role,
      active: true,
    });
    if (rowErr) {
      // Don't leave an auth user that can sign in but has no staff row — they'd
      // hit "not registered as staff" forever with no way to fix it from the UI.
      await db.auth.admin.deleteUser(created.user.id);
      throw new Error(rowErr.message);
    }

    revalidatePath("/settings/staff");
  });
}

export async function setStaffRole(
  id: string,
  role: "admin" | "staff" | "supplier"
): Promise<ActionResult<void>> {
  return run(async () => {
    const me = await requireAdmin();
    if (id === me.id && role !== "admin") {
      throw new Error("You can't remove your own admin access.");
    }
    if (role !== "admin" && (await otherActiveAdmins(id)) === 0) {
      throw new Error("This is the last admin — promote someone else first.");
    }

    const db = createAdminClient();
    const { error } = await db.from("staff_users").update({ role }).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings/staff");
  });
}

export async function setStaffActive(
  id: string,
  active: boolean
): Promise<ActionResult<void>> {
  return run(async () => {
    const me = await requireAdmin();
    if (id === me.id && !active) {
      throw new Error("You can't deactivate your own account.");
    }
    if (!active && (await otherActiveAdmins(id)) === 0) {
      const db = createAdminClient();
      const { data } = await db
        .from("staff_users")
        .select("role")
        .eq("id", id)
        .maybeSingle();
      if (data?.role === "admin") {
        throw new Error("This is the last admin — promote someone else first.");
      }
    }

    const db = createAdminClient();
    const { error } = await db
      .from("staff_users")
      .update({ active })
      .eq("id", id);
    if (error) throw new Error(error.message);

    // Kill any live session so revoking access takes effect immediately rather
    // than whenever their current session happens to expire.
    if (!active) {
      try {
        await db.auth.admin.signOut(id, "global");
      } catch {
        /* best effort — the is_staff() guard already blocks them */
      }
    }

    revalidatePath("/settings/staff");
  });
}

export async function resetStaffPassword(
  id: string,
  password: string
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    const db = createAdminClient();
    const { error } = await db.auth.admin.updateUserById(id, { password });
    if (error) throw new Error(error.message);
    revalidatePath("/settings/staff");
  });
}

/**
 * Delete a staff account outright.
 *
 * Deactivating is the right move for someone who has left — their name stays
 * on the orders they worked. Deleting is for the account created by mistake,
 * or one that should never have existed. The auth user goes with it, so the
 * login stops working immediately; the staff row and their document scope
 * cascade from it, and history entries keep their record and simply stop
 * naming anyone (migration 0025).
 *
 * The same two lockout guards as everywhere else: not yourself, and not the
 * last admin.
 */
export async function deleteStaffAccount(
  id: string
): Promise<ActionResult<void>> {
  return run(async () => {
    const me = await requireAdmin();
    if (id === me.id) {
      throw new Error(
        "You can't delete your own account. Ask another admin to do it."
      );
    }
    if ((await otherActiveAdmins(id)) === 0) {
      const db = createAdminClient();
      const { data } = await db
        .from("staff_users")
        .select("role, active")
        .eq("id", id)
        .maybeSingle();
      if (data?.role === "admin" && data.active) {
        throw new Error("This is the last admin — promote someone else first.");
      }
    }

    const db = createAdminClient();
    // Deleting the auth user cascades to staff_users and staff_services.
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) {
      // A row with no auth user behind it can still be cleared up.
      if (/not found/i.test(error.message)) {
        const { error: rowErr } = await db
          .from("staff_users")
          .delete()
          .eq("id", id);
        if (rowErr) throw new Error(rowErr.message);
      } else {
        throw new Error(error.message);
      }
    }

    revalidatePath("/settings/staff");
  });
}

export async function setStaffMessengerPage(
  id: string,
  pageId: string | null
): Promise<ActionResult<void>> {
  return run(async () => {
    await requireAdmin();
    const db = createAdminClient();
    const { error } = await db
      .from("staff_users")
      .update({ default_messenger_page_id: pageId })
      .eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings/staff");
  });
}

/**
 * Limit a staff member to specific documents. An empty list means no limit —
 * they see everything, which is what every account does by default.
 *
 * The real enforcement is RLS (migration 0018); this only writes the rows the
 * policies read, so a stale browser tab can't see anything it shouldn't.
 */
export async function setStaffServices(
  id: string,
  serviceIds: string[]
): Promise<ActionResult<void>> {
  return run(async () => {
    const me = await requireAdmin();
    if (id === me.id && serviceIds.length > 0) {
      throw new Error(
        "You can't limit your own account — you'd lose sight of the rest of the business."
      );
    }

    const db = createAdminClient();
    const { error: delErr } = await db
      .from("staff_services")
      .delete()
      .eq("staff_id", id);
    if (delErr) throw new Error(delErr.message);

    if (serviceIds.length > 0) {
      const { error } = await db
        .from("staff_services")
        .insert(serviceIds.map((service_id) => ({ staff_id: id, service_id })));
      if (error) throw new Error(error.message);
    }
    revalidatePath("/settings/staff");
  });
}

export interface StaffRow {
  id: string;
  name: string;
  email: string | null;
  role: "admin" | "staff" | "supplier";
  active: boolean;
  created_at: string;
  /** Page pre-selected on orders this person creates. */
  default_messenger_page_id: string | null;
  /** Documents this account may see. Empty = no limit. */
  service_ids: string[];
}

export async function listStaff(): Promise<StaffRow[]> {
  await requireAdmin();
  const supabase = createClient();
  const [{ data, error }, { data: scopes }] = await Promise.all([
    supabase
      .from("staff_users")
      .select("id, name, email, role, active, created_at, default_messenger_page_id")
      .order("active", { ascending: false })
      .order("created_at"),
    supabase.from("staff_services").select("staff_id, service_id"),
  ]);
  if (error) throw new Error(error.message);

  const byStaff = new Map<string, string[]>();
  for (const r of scopes ?? []) {
    byStaff.set(r.staff_id, [...(byStaff.get(r.staff_id) ?? []), r.service_id]);
  }
  return (data ?? []).map((r) => ({
    ...r,
    service_ids: byStaff.get(r.id) ?? [],
  })) as StaffRow[];
}
