import Link from "next/link";
import { Plus, Lock } from "lucide-react";
import { getStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { OrdersTable, type OrderRow } from "@/components/admin/OrdersTable";
import { surnameIssues } from "@/lib/parse/surname";
import type { OrderStatus, Service } from "@/lib/types";
import { listTags } from "@/lib/actions/tags";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const supabase = createClient();

  const [staff, { data: statuses }, { data: services }, { data: orders }, { data: attempts }, tags] =
    await Promise.all([
      getStaff(),
      supabase.from("order_statuses").select("*").order("sort_order"),
      supabase.from("services").select("*").order("sort_order").order("name"),
      supabase
        .from("orders")
        .select(
          `id, tracking_code, status, total_amount, created_at, status_since,
           delayed_at, delay_reason, delivery_attempts, source, created_by,
           customers ( id, full_name, phone, customer_tags ( tag_id ) ),
           staff_users ( name ),
           order_items ( form_details, services ( code, name ) )`
        )
        .order("created_at", { ascending: false }),
      // Why each delivery failed, for the call list. Oldest first so the loop
      // below leaves the most recent attempt per order in the map.
      supabase
        .from("order_status_history")
        .select("order_id, note, attempt_number, created_at")
        .eq("event_type", "failed_attempt")
        .order("created_at", { ascending: true }),
      listTags(),
    ]);

  const statusLabel = new Map(
    (statuses ?? []).map((s) => [s.code, s.label as string])
  );

  const lastAttempt = new Map<string, { note: string | null; at: string }>();
  for (const a of attempts ?? []) {
    lastAttempt.set(a.order_id, { note: a.note, at: a.created_at });
  }

  const rows: OrderRow[] = (orders ?? []).map((o: any) => {
    const svcCodes: string[] = [];
    const svcNames: string[] = [];
    // The parents'-surname rule is checked here rather than only inside the
    // order, so the ones to go back over can be found from the board instead
    // of by opening every order to look.
    const nameIssues: string[] = [];
    for (const it of o.order_items ?? []) {
      if (it.services) {
        svcCodes.push(it.services.code);
        svcNames.push(it.services.name);
        for (const issue of surnameIssues(
          it.services.code,
          (it.form_details ?? {}) as Record<string, string>
        )) {
          nameIssues.push(issue.message);
        }
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
      delayed_at: o.delayed_at ?? null,
      delay_reason: o.delay_reason ?? null,
      delivery_attempts: o.delivery_attempts,
      source: o.source ?? "staff",
      customer_id: o.customers?.id ?? null,
      customer_name: o.customers?.full_name ?? "—",
      customer_phone: o.customers?.phone ?? null,
      tag_ids: (o.customers?.customer_tags ?? []).map((t: any) => t.tag_id),
      created_by_id: o.created_by ?? null,
      created_by_name: o.staff_users?.name ?? null,
      service_codes: svcCodes,
      service_names: svcNames,
      name_issues: nameIssues,
      last_attempt_note: lastAttempt.get(o.id)?.note ?? null,
      last_attempt_at: lastAttempt.get(o.id)?.at ?? null,
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
          {staff && staff.service_ids.length > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs text-amber-900">
              <Lock className="h-3.5 w-3.5" />
              Showing only{" "}
              {(services ?? [])
                .filter((s) => staff.service_ids.includes(s.id))
                .map((s) => s.name)
                .join(", ")}{" "}
              — the documents your account covers.
            </p>
          )}
        </div>
        <Link href="/orders/new" className={buttonVariants()}>
          <Plus className="h-4 w-4" /> New order
        </Link>
      </div>

      <OrdersTable
        tags={tags}
        orders={rows}
        statuses={(statuses ?? []) as OrderStatus[]}
        services={
          staff && staff.service_ids.length > 0
            ? ((services ?? []) as Service[]).filter((s) =>
                staff.service_ids.includes(s.id)
              )
            : ((services ?? []) as Service[])
        }
      />
    </div>
  );
}
