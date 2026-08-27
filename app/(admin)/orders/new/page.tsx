import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewOrderForm } from "@/components/admin/NewOrderForm";
import type { Service } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const supabase = createClient();
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("active", true)
    .order("name");

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
      <NewOrderForm services={(services ?? []) as Service[]} />
    </div>
  );
}
