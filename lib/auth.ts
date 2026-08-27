import { createClient } from "@/lib/supabase/server";
import type { Role } from "./types";

export interface StaffContext {
  id: string;
  name: string;
  role: Role;
}

/**
 * Resolve the signed-in staff user for a Server Action / Server Component.
 * Throws if there is no session or no staff_users row (RLS would block anyway).
 */
export async function requireStaff(): Promise<StaffContext> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: staff } = await supabase
    .from("staff_users")
    .select("name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!staff) throw new Error("Not a staff user");
  return { id: user.id, name: staff.name, role: staff.role as Role };
}
