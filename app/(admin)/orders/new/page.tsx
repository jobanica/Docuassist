import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewOrderForm } from "@/components/admin/NewOrderForm";
import { getStaff } from "@/lib/auth";
import { listMessengerPages } from "@/lib/actions/messenger-pages";
import type { Service } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const supabase = createClient();
  const [staff, { data: services }, pages] = await Promise.all([
    getStaff(),
    supabase.from("services").select("*").eq("active", true).order("name"),
    listMessengerPages(),
  ]);

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
      </div>
      <NewOrderForm
        services={(services ?? []) as Service[]}
        messengerPages={pages.filter((p) => p.active)}
        defaultPageId={
          staff?.default_messenger_page_id ??
          pages.find((p) => p.is_default)?.id ??
          null
        }
      />
    </div>
  );
}
