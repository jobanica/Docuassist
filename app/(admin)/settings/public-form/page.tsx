import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { PublicFormSettings } from "@/components/admin/PublicFormSettings";

export const dynamic = "force-dynamic";

export default async function PublicFormSettingsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const supabase = createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  const map = new Map((data ?? []).map((r) => [r.key, r.value ?? ""]));

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Let customers place their own orders through a link, instead of you
        encoding every request from Messenger.
      </p>
      <PublicFormSettings
        canEdit={staff.role === "admin"}
        orderUrl={`${base}/order`}
        smsConfigured={Boolean(process.env.SEMAPHORE_API_KEY)}
        initial={{
          public_orders_enabled: (map.get("public_orders_enabled") ?? "true") !== "false",
          otp_required: (map.get("otp_required") ?? "true") !== "false",
        }}
      />
    </div>
  );
}
