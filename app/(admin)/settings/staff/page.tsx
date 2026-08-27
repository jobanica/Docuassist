import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { listStaff } from "@/lib/actions/staff";
import { StaffSettings } from "@/components/admin/StaffSettings";

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  // Staff can't manage logins at all — not even read the list.
  if (staff.role !== "admin") redirect("/orders");

  const rows = await listStaff();

  return <StaffSettings staff={rows} meId={staff.id} />;
}
