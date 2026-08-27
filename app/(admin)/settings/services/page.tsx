import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { ServicesEditor } from "@/components/admin/ServicesEditor";
import type { Service } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ServicesSettingsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const supabase = createClient();
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .order("active", { ascending: false })
    .order("name");

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        The documents you offer, what they cost, and how long they take. These
        drive the new-order screen and the expected dates shown to customers.
      </p>
      <ServicesEditor
        services={(services ?? []) as Service[]}
        canEdit={staff.role === "admin"}
      />
    </div>
  );
}
