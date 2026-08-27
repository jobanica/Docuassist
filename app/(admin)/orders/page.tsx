import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { OrdersTable, type OrderRow } from "@/components/admin/OrdersTable";
import type { OrderStatus, Service } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const supabase = createClient();

  const [{ data: statuses }, { data: services }, { data: orders }] =
    await Promise.all([
      supabase.from("order_statuses").select("*").order("sort_order"),
      supabase.from("services").select("*").order("name"),
      supabase
        .from("orders")
        .select(
          `id, tracking_code, status, total_amount, created_at, status_since,
           delivery_attempts, source,
           customers ( full_name, phone ),
           order_items ( services ( code, name ) )`
        )
        .order("created_at", { ascending: false }),
    ]);

  const statusLabel = new Map(
    (statuses ?? []).map((s) => [s.code, s.label as string])
  );

  const rows: OrderRow[] = (orders ?? []).map((o: any) => {
    const svcCodes: string[] = [];
    const svcNames: string[] = [];
    for (const it of o.order_items ?? []) {
      if (it.services) {
        svcCodes.push(it.services.code);
        svcNames.push(it.services.name);
      }
    }
    return {
      id: o.id,
      tracking_code: o.tracking_code,
      status: o.status,
      status_label: statusLabel.get(o.status) ?? o.status,
      total_amount: Number(o.total_amount),
      created_at: o.created_at,
      status_since: o.status_since,
      delivery_attempts: o.delivery_attempts,
      source: o.source ?? "staff",
      customer_name: o.customers?.full_name ?? "—",
      customer_phone: o.customers?.phone ?? null,
      service_codes: svcCodes,
      service_names: svcNames,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">
            Filter, search, and track every order through the pipeline.
          </p>
        </div>
        <Link href="/orders/new" className={buttonVariants()}>
          <Plus className="h-4 w-4" /> New order
        </Link>
      </div>

      <OrdersTable
        orders={rows}
        statuses={(statuses ?? []) as OrderStatus[]}
        services={(services ?? []) as Service[]}
      />
    </div>
  );
}
