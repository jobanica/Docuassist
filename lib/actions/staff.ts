"use server";

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
  role: z.enum(["admin", "staff"]),
});

export type CreateStaffInput = z.infer<typeof createSchema>;

export async function createStaffAccount(
  input: CreateStaffInput
): Promise<void> {
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
}

export async function setStaffRole(
  id: string,
  role: "admin" | "staff"
): Promise<void> {
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
}

export async function setStaffActive(
  id: string,
  active: boolean
): Promise<void> {
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
}

export async function resetStaffPassword(
  id: string,
  password: string
): Promise<void> {
  await requireAdmin();
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const db = createAdminClient();
  const { error } = await db.auth.admin.updateUserById(id, { password });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/staff");
}

export interface StaffRow {
  id: string;
  name: string;
  email: string | null;
  role: "admin" | "staff";
  active: boolean;
  created_at: string;
}

export async function listStaff(): Promise<StaffRow[]> {
  await requireAdmin();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff_users")
    .select("id, name, email, role, active, created_at")
    .order("active", { ascending: false })
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffRow[];
}
