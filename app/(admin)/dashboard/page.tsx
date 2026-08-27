import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const PIPELINE = [
  "new_inquiry",
  "details_received",
  "processing",
  "released",
  "shipped",
  "delivered",
];

export default async function DashboardPage() {
  const supabase = createClient();

  // Status labels (DB-driven) + order counts per status.
  const [{ data: statuses }, { data: orders }] = await Promise.all([
    supabase.from("order_statuses").select("code, label, sort_order").order("sort_order"),
    supabase.from("orders").select("status"),
  ]);

  const counts = new Map<string, number>();
  for (const o of orders ?? []) {
    counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
  }

  const pipeline = (statuses ?? []).filter((s) => PIPELINE.includes(s.code));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Orders per stage. Full sales metrics arrive in Phase 7.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {pipeline.map((s) => (
          <Card key={s.code}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">
                {counts.get(s.code) ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {(orders?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No orders yet. Order encoding is built in Phase 2.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
