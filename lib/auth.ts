import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "./types";

export interface StaffContext {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  /** Facebook page pre-selected on orders this person creates. */
  default_messenger_page_id: string | null;
  /** Documents this account may see. Empty = no limit. RLS enforces it; this
   *  is only so screens don't offer what the database would refuse. */
  service_ids: string[];
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

  const [{ data: staff }, { data: scope }] = await Promise.all([
    supabase
      .from("staff_users")
      .select("name, email, role, active, default_messenger_page_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("staff_services").select("service_id").eq("staff_id", user.id),
  ]);

  // A deactivated account has a valid session but no access. is_staff() in the
  // database enforces the same thing, so this is the UI half of one rule.
  if (!staff || !staff.active) return null;
  return {
    id: user.id,
    name: staff.name,
    email: staff.email ?? user.email ?? null,
    role: staff.role as Role,
    default_messenger_page_id: staff.default_messenger_page_id ?? null,
    service_ids: (scope ?? []).map((r) => r.service_id),
  };
});

/** Same, but throws — for Server Actions that must have a staff caller. */
export async function requireStaff(): Promise<StaffContext> {
  const staff = await getStaff();
  if (!staff) throw new Error("Not authenticated");
  return staff;
}
