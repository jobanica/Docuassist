import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Staff have no sales dashboard, so send them to the orders board directly
  // rather than bouncing them off /dashboard.
  const { data: staff } = await supabase
    .from("staff_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  redirect(staff?.role === "admin" ? "/dashboard" : "/orders");
}
