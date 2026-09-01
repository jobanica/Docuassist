import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { ServicesEditor } from "@/components/admin/ServicesEditor";
import {
  ShippingFeeSetting,
  IdVerificationFeeSetting,
} from "@/components/admin/FeeSettings";
import type { Service } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ServicesSettingsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const supabase = createClient();
  const { data: fees } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["shipping_fee", "id_verification_fee"]);
  const fee = new Map((fees ?? []).map((r) => [r.key, r.value ?? ""]));
  const { data: services } = await supabase
    .from("services")
    .select("*")
    // Same order as everywhere else, so the up/down arrows move a row to
    // where it will actually appear. Disabled services stay in place, dimmed.
    .order("sort_order")
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
      <div className="grid gap-4 md:grid-cols-2">
        <ShippingFeeSetting
          initial={fee.get("shipping_fee") ?? "185"}
          canEdit={staff.role === "admin"}
        />
        <IdVerificationFeeSetting
          initial={fee.get("id_verification_fee") ?? "100"}
          canEdit={staff.role === "admin"}
        />
      </div>
    </div>
  );
}
