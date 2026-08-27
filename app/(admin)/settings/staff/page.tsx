import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { listStaff } from "@/lib/actions/staff";
import { listMessengerPages } from "@/lib/actions/messenger-pages";
import { createClient } from "@/lib/supabase/server";
import type { Service } from "@/lib/types";
import { StaffSettings } from "@/components/admin/StaffSettings";

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  // Staff can't manage logins at all — not even read the list.
  if (staff.role !== "admin") redirect("/orders");

  const supabase = createClient();
  const [rows, pages, { data: services }] = await Promise.all([
    listStaff(),
    listMessengerPages(),
    supabase.from("services").select("*").eq("active", true).order("name"),
  ]);

  return (
    <StaffSettings
      staff={rows}
      meId={staff.id}
      messengerPages={pages.filter((p) => p.active)}
      services={(services ?? []) as Service[]}
    />
  );
}
