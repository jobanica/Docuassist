import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewOrderForm } from "@/components/admin/NewOrderForm";
import { getStaff } from "@/lib/auth";
import { listMessengerPages } from "@/lib/actions/messenger-pages";
import { idVerificationFee } from "@/lib/actions/settings";
import type { Service } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const supabase = createClient();
  const [staff, { data: services }, pages, { data: parsingSetting }, verifyFee] =
    await Promise.all([
      getStaff(),
      supabase
        .from("services")
        .select("*")
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      listMessengerPages(),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "parsing_enabled")
        .maybeSingle(),
      idVerificationFee(),
    ]);

  // Offer only what RLS would let them insert, so the order can't fail at the
  // last step with a policy error.
  const all = (services ?? []) as Service[];
  const allowed =
    staff && staff.service_ids.length > 0
      ? all.filter((s) => staff.service_ids.includes(s.id))
      : all;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">New order</h1>
        <p className="text-sm text-muted-foreground">
          Name, document, paste their reply — that&apos;s the whole intake.
        </p>
        {staff && staff.service_ids.length > 0 && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs text-amber-900">
            <Lock className="h-3.5 w-3.5" />
            Your account covers {allowed.map((s) => s.name).join(", ")} only.
          </p>
        )}
      </div>
      <NewOrderForm
        services={allowed}
        messengerPages={pages.filter((p) => p.active)}
        parsingEnabled={(parsingSetting?.value ?? "true") !== "false"}
        verificationFee={verifyFee}
        defaultPageId={
          staff?.default_messenger_page_id ??
          pages.find((p) => p.is_default)?.id ??
          null
        }
      />
    </div>
  );
}
