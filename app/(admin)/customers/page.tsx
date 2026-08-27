import { createClient } from "@/lib/supabase/server";
import { CustomersList, type CustomerRow } from "@/components/admin/CustomersList";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const supabase = createClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, full_name, phone, city, province, created_at, orders ( id )")
    .order("created_at", { ascending: false });

  const rows: CustomerRow[] = (customers ?? []).map((c: any) => ({
    id: c.id,
    full_name: c.full_name,
    phone: c.phone,
    city: c.city,
    province: c.province,
    order_count: c.orders?.length ?? 0,
    created_at: c.created_at,
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
      <CustomersList customers={rows} />
    </div>
  );
}
