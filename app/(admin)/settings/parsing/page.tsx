import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { ParsingSettings } from "@/components/admin/ParsingSettings";

export const dynamic = "force-dynamic";

export default async function ParsingSettingsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const supabase = createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  const map = new Map((data ?? []).map((r) => [r.key, r.value ?? ""]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Turn the paste auto-fill on or off. Takes effect on the next click — no
        redeploy.
      </p>
      <ParsingSettings
        canEdit={staff.role === "admin"}
        aiKeyConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}
        initial={{
          parsing_enabled: (map.get("parsing_enabled") ?? "true") !== "false",
          parsing_ai_enabled:
            (map.get("parsing_ai_enabled") ?? "false") !== "false",
        }}
      />
    </div>
  );
}
