import { createClient } from "@/lib/supabase/server";
import { CustomersList, type CustomerRow } from "@/components/admin/CustomersList";
import { listTags } from "@/lib/actions/tags";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const supabase = createClient();
  const [{ data: customers }, tags] = await Promise.all([
    supabase
      .from("customers")
      .select(
        "id, full_name, phone, city, province, created_at, orders ( id ), customer_tags ( tag_id )"
      )
      .order("created_at", { ascending: false }),
    listTags(),
  ]);

  const rows: CustomerRow[] = (customers ?? []).map((c: any) => ({
    id: c.id,
    full_name: c.full_name,
    phone: c.phone,
    city: c.city,
    province: c.province,
    order_count: c.orders?.length ?? 0,
    created_at: c.created_at,
    tag_ids: (c.customer_tags ?? []).map((t: any) => t.tag_id),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} customer{rows.length === 1 ? "" : "s"}. Repeat customers
          are common — pick them again on the new-order screen.
        </p>
      </div>
      <CustomersList customers={rows} tags={tags} />
    </div>
  );
}
