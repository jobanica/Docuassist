import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RangePicker } from "@/components/admin/RangePicker";
import { RtsTrend } from "@/components/admin/RtsTrend";
import { loadSales, resolveRange } from "@/lib/sales";
import { peso } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { aging } from "@/lib/status";
import type { StatusCode } from "@/lib/types";

export const dynamic = "force-dynamic";

const PIPELINE_CODES = [
  "new_inquiry",
  "details_received",
  "processing",
  "released",
  "shipped",
  "delivered",
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  const supabase = createClient();
  const range = resolveRange(
    searchParams.range,
    searchParams.from,
    searchParams.to
  );

  const [{ data: statuses }, { data: orders }, sales] = await Promise.all([
    supabase.from("order_statuses").select("code, label, sort_order").order("sort_order"),
    supabase.from("orders").select("id, status, status_since"),
    loadSales(range.from, range.to),
  ]);

  const counts = new Map<string, number>();
  let agingCount = 0;
  for (const o of orders ?? []) {
    counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
    if (aging(o.status as StatusCode, o.status_since) === "alert") agingCount++;
  }
  const pipeline = (statuses ?? []).filter((s) => PIPELINE_CODES.includes(s.code));
  const s = sales.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {fmtDate(range.from)} – {fmtDate(range.to)} · all figures computed
            from order data
          </p>
        </div>
        <Suspense>
          <RangePicker activeKey={range.key} from={range.from} to={range.to} />
        </Suspense>
      </div>

      {/* --- Sales (§11) --- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric
          label="Booked sales"
          value={peso(s?.booked_amount ?? 0)}
          sub={`${s?.booked_count ?? 0} orders encoded`}
        />
        <Metric
          label="Collected revenue"
          value={peso(s?.collected_amount ?? 0)}
          sub={`${s?.collected_count ?? 0} delivered & paid`}
          tone="good"
        />
        <Metric
          label="RTS losses"
          value={`− ${peso(s?.rts_amount ?? 0)}`}
          sub={`${s?.rts_count ?? 0} returned`}
          tone="bad"
        />
        <Metric
          label="Cancellations"
          value={`− ${peso(s?.cancelled_amount ?? 0)}`}
          sub={`${s?.cancelled_count ?? 0} cancelled`}
          tone="bad"
        />
        <Metric
          label="Net sales"
          value={peso(s?.net_amount ?? 0)}
          sub="booked − returns − cancellations"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        {/* RTS rate + trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>RTS rate (this range)</CardDescription>
            <CardTitle className="text-3xl">
              {s?.rts_rate ?? 0}%
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {s?.shipped_returned_count ?? 0} of {s?.shipped_count ?? 0} shipped
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Share of shipped orders that came back. The health metric for a
              COD business — last 6 months:
            </p>
            <RtsTrend points={sales.trend} />
          </CardContent>
        </Card>

        {/* Pipeline counts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Orders per stage</CardTitle>
            <CardDescription>
              All open orders, not limited to the selected range.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {pipeline.map((st) => (
                <Link
                  key={st.code}
                  href={`/orders`}
                  className="rounded-md border p-2 text-center hover:bg-accent/40"
                >
                  <p className="text-2xl font-semibold">
                    {counts.get(st.code) ?? 0}
                  </p>
                  <p className="text-[11px] leading-tight text-muted-foreground">
                    {st.label}
                  </p>
                </Link>
              ))}
            </div>
            {agingCount > 0 && (
              <Link
                href="/orders"
                className="flex items-center gap-2 rounded-md bg-red-50 p-2 text-sm text-red-700 hover:bg-red-100"
              >
                <AlertTriangle className="h-4 w-4" />
                {agingCount} order{agingCount === 1 ? " is" : "s are"} stuck too
                long in a stage — review them
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Breakdowns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By service</CardTitle>
            <CardDescription>
              Which documents earn the most — and which get returned the most.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Service</th>
                  <th className="pb-2 text-right font-medium">Booked</th>
                  <th className="pb-2 text-right font-medium">Collected</th>
                  <th className="pb-2 text-right font-medium">RTS</th>
                </tr>
              </thead>
              <tbody>
                {sales.byService.map((r) => (
                  <tr key={r.service_name} className="border-t">
                    <td className="py-2">{r.service_name}</td>
                    <td className="py-2 text-right">
                      {peso(r.booked_amount)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({r.booked_count})
                      </span>
                    </td>
                    <td className="py-2 text-right">{peso(r.collected_amount)}</td>
                    <td className="py-2 text-right text-red-700">
                      {r.rts_count > 0 ? `− ${peso(r.rts_amount)}` : "—"}
                    </td>
                  </tr>
                ))}
                {sales.byService.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      No orders in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By courier</CardTitle>
            <CardDescription>
              Per-courier RTS rate — is one courier failing more?
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Courier</th>
                  <th className="pb-2 text-right font-medium">Shipped</th>
                  <th className="pb-2 text-right font-medium">Returned</th>
                  <th className="pb-2 text-right font-medium">RTS rate</th>
                </tr>
              </thead>
              <tbody>
                {sales.byCourier.map((r) => (
                  <tr key={r.courier_name} className="border-t">
                    <td className="py-2">{r.courier_name}</td>
                    <td className="py-2 text-right">{r.shipped_count}</td>
                    <td className="py-2 text-right">{r.returned_count}</td>
                    <td
                      className={`py-2 text-right font-medium ${
                        r.rts_rate >= 20
                          ? "text-red-700"
                          : r.rts_rate >= 10
                            ? "text-amber-700"
                            : "text-emerald-700"
                      }`}
                    >
                      {r.rts_rate}%
                    </td>
                  </tr>
                ))}
                {sales.byCourier.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      Nothing shipped in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Returned orders with reasons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Returned orders ({sales.returned.length})
          </CardTitle>
          <CardDescription>
            Reasons and destinations, so patterns show up — bad addresses, a
            failing courier, unreachable customers.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Customer</th>
                <th className="pb-2 font-medium">Courier</th>
                <th className="pb-2 font-medium">Reason</th>
                <th className="pb-2 text-right font-medium">Lost</th>
                <th className="pb-2 text-right font-medium">Returned</th>
              </tr>
            </thead>
            <tbody>
              {sales.returned.map((r) => (
                <tr key={r.order_id} className="border-t">
                  <td className="py-2">
                    <Link
                      href={`/orders/${r.order_id}`}
                      className="font-medium hover:underline"
                    >
                      {r.customer_name}
                    </Link>
                    {r.city && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        · {r.city}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {r.courier_name ?? "—"}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {r.return_reason ?? "—"}
                    {r.delivery_attempts > 0 && (
                      <span className="ml-1 text-xs">
                        ({r.delivery_attempts}/3 attempts)
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right text-red-700">
                    − {peso(r.total_amount)}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    {fmtDate(r.returned_at)}
                  </td>
                </tr>
              ))}
              {sales.returned.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No returns in this range. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "bad";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={`text-2xl ${
            tone === "good"
              ? "text-emerald-700"
              : tone === "bad"
                ? "text-red-700"
                : ""
          }`}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
