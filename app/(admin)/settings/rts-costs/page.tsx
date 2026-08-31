import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { RtsCostSettings } from "@/components/admin/RtsCostSettings";

export const dynamic = "force-dynamic";

export default async function RtsCostSettingsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const supabase = createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  const map = new Map((data ?? []).map((r) => [r.key, r.value ?? ""]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        The money already spent on a document by the time a parcel is returned.
        Changing a figure here re-states the dashboard straight away — the
        losses are worked out from these numbers each time it loads, never
        stored, so past months move too.
      </p>
      <RtsCostSettings
        canEdit={staff.role === "admin"}
        initial={{
          processing: map.get("rts_cost_processing") ?? "0",
          shipping: map.get("rts_cost_shipping") ?? "0",
          commission: map.get("rts_cost_commission") ?? "0",
          ad: map.get("rts_cost_ad") ?? "0",
        }}
      />
    </div>
  );
}
