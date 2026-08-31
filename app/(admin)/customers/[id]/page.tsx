import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { peso } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import type { OrderStatus } from "@/lib/types";
import { CustomerTags } from "@/components/admin/CustomerTags";
import { listTags } from "@/lib/actions/tags";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const [{ data: customer }, { data: statuses }, tags] = await Promise.all([
    supabase
      .from("customers")
      .select(
        `*, orders ( id, tracking_code, status, total_amount, created_at, merged_into ),
         customer_tags ( tag_id )`
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase.from("order_statuses").select("*").order("sort_order"),
    listTags(),
  ]);

  if (!customer) notFound();

  const c = customer as any;
  const statusLabel = new Map(
    ((statuses ?? []) as OrderStatus[]).map((s) => [s.code, s.label])
  );
  // Orders combined into another are the same job counted twice — their
  // documents and money now sit on the order that kept the parcel.
  const orders = [...(c.orders ?? [])]
    .filter((o: any) => !o.merged_into)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{c.full_name}</h1>
        {/* Which batches this customer is in — the thing staff come back for
            days later, when the stack returns from the PSA counter. */}
        <div className="mt-2">
          <CustomerTags
            customerId={c.id}
            tags={tags}
            selected={(c.customer_tags ?? []).map((t: any) => t.tag_id)}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <Info label="Phone" value={c.phone} />
          <Info label="Messenger" value={c.messenger_name} />
          <Info label="Messenger link" value={c.messenger_link} />
          <Info
            label="Address"
            value={
              [c.address_line, c.barangay, c.city, c.province, c.zip]
                .filter(Boolean)
                .join(", ") || null
            }
          />
          <Info label="Notes" value={c.notes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Order history ({orders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {orders.map((o: any) => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="flex items-center justify-between py-3 hover:bg-accent/40"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge
                    code={o.status}
                    label={statusLabel.get(o.status) ?? o.status}
                  />
                  <span className="font-mono text-xs text-muted-foreground">
                    {o.tracking_code}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span>{peso(o.total_amount)}</span>
                  <span className="text-muted-foreground">
                    {fmtDate(o.created_at)}
                  </span>
                </div>
              </Link>
            ))}
            {orders.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No orders yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p>{value || "—"}</p>
    </div>
  );
}
