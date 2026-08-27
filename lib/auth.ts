import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "./types";

export interface StaffContext {
  id: string;
  name: string;
  email: string | null;
  role: Role;
}

/**
 * Resolve the signed-in staff user.
 *
 * Wrapped in React `cache()` so the layout and the page it renders share one
 * lookup per request instead of each doing its own getUser + staff_users
 * round trip. That matters here: the database is in Seoul and every extra
 * round trip is real latency.
 *
 * Returns null when there is no session or no staff_users row.
 */
export const getStaff = cache(async (): Promise<StaffContext | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: staff } = await supabase
    .from("staff_users")
    .select("name, email, role, active")
    .eq("id", user.id)
    .maybeSingle();

  // A deactivated account has a valid session but no access. is_staff() in the
  // database enforces the same thing, so this is the UI half of one rule.
  if (!staff || !staff.active) return null;
  return {
    id: user.id,
    name: staff.name,
    email: staff.email ?? user.email ?? null,
    role: staff.role as Role,
  };
});

/** Same, but throws — for Server Actions that must have a staff caller. */
export async function requireStaff(): Promise<StaffContext> {
  const staff = await getStaff();
  if (!staff) throw new Error("Not authenticated");
  return staff;
}
