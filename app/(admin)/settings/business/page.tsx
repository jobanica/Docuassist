import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { BusinessSettings } from "@/components/admin/BusinessSettings";
import { MessengerPagesEditor } from "@/components/admin/MessengerPagesEditor";
import { listMessengerPages } from "@/lib/actions/messenger-pages";

export const dynamic = "force-dynamic";

export default async function BusinessSettingsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const supabase = createClient();
  const [{ data }, pages] = await Promise.all([
    supabase.from("app_settings").select("key, value"),
    listMessengerPages(),
  ]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value ?? ""]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        What customers see on your public tracking pages.
      </p>
      <BusinessSettings
        canEdit={staff.role === "admin"}
        initial={{
          business_name: map.get("business_name") ?? "DocuAssist PH",
          logo_url: map.get("logo_url") ?? "",
          logo_includes_name: map.get("logo_includes_name") === "1",
        }}
      />
      <MessengerPagesEditor pages={pages} canEdit={staff.role === "admin"} />
    </div>
  );
}
