"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

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
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!staff) {
    await supabase.auth.signOut();
    return {
      error:
        "This account is not registered as staff. Ask an admin to add you.",
    };
  }

  redirect(next.startsWith("/") ? next : "/dashboard");
}
