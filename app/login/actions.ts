"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Must have a staff_users row to use the admin app (RLS gate).
  const { data: staff } = await supabase
    .from("staff_users")
    .select("id, role, active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!staff) {
    await supabase.auth.signOut();
    return {
      error:
        "This account is not registered as staff. Ask an admin to add you.",
    };
  }
  if (!staff.active) {
    await supabase.auth.signOut();
    return { error: "This account has been deactivated. Please contact your admin." };
  }

  // Admins land on the sales dashboard; staff on the orders board.
  const home = staff.role === "admin" ? "/dashboard" : "/orders";
  redirect(next.startsWith("/") ? next : home);
}
