import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Wallet, TrendingUp, PackageX, Ban } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { RangePicker } from "@/components/admin/RangePicker";
import { MonthlyBars } from "@/components/charts/MonthlyBars";
import { RtsDonut } from "@/components/charts/RtsDonut";
import { loadSales, resolveRange } from "@/lib/sales";
import { peso } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { aging } from "@/lib/status";
import type { StatusCode } from "@/lib/types";

export const dynamic = "force-dynamic";

const PIPELINE_CODES = [
  "new_inquiry", "details_received", "processing", "released", "shipped", "delivered",
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  // Sales figures are admin-only. Staff keep the full CRM and land on the
  // orders board, which carries the same aging highlights.
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (staff.role !== "admin") redirect("/orders");

  const supabase = createClient();
  const range = resolveRange(searchParams.range, searchParams.from, searchParams.to);

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
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {fmtDate(range.from)} – {fmtDate(range.to)} · computed from order data
          </p>
        </div>
        <Suspense>
          <RangePicker activeKey={range.key} from={range.from} to={range.to} />
        </Suspense>
      </div>

      {/* Stat cards — the first is the headline figure, so it carries the emphasis */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          featured
          icon={<Wallet className="h-4 w-4" />}
          label="Collected"
          value={peso(s?.collected_amount ?? 0)}
          sub={`${s?.collected_count ?? 0} delivered & paid`}
        />
        <Stat
          icon={<TrendingUp className="h-4 w-4 text-[#2a78d6]" />}
          label="Booked"
          value={peso(s?.booked_amount ?? 0)}
          sub={
            (s?.cancelled_count ?? 0) > 0
              ? `${s?.booked_count ?? 0} orders · ${s?.cancelled_count} cancelled not counted`
              : `${s?.booked_count ?? 0} orders encoded`
          }
        />
        <Stat
          icon={<PackageX className="h-4 w-4 text-red-500" />}
          label="RTS losses"
          value={`− ${peso(s?.rts_loss_amount ?? 0)}`}
          sub={
            (s?.rts_docs ?? 0) > 0
              ? `${s?.rts_docs} document${s?.rts_docs === 1 ? "" : "s"} × ${peso(
                  s?.rts_cost_per_doc ?? 0
                )}`
              : "nothing returned"
          }
          tone="bad"
        />
        <Stat
          icon={<Ban className="h-4 w-4 text-slate-400" />}
          label="Net sales"
          value={peso(s?.net_amount ?? 0)}
          sub={
            (s?.rts_count ?? 0) > 0
              ? `booked less ${s?.rts_count} returned`
              : "nothing returned to deduct"
          }
        />
      </div>

      {/* Chart row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Revenue by month</h2>
              <p className="text-xs text-slate-500">
                Booked when encoded, less cancellations · collected when COD is
                received
              </p>
            </div>
            <Link
              href="/orders"
              className="inline-flex items-center gap-1 rounded-full bg-[#eda100] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#d18f00]"
            >
              View orders <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <MonthlyBars data={sales.monthly} />
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-slate-900">Return rate</h2>
          <RtsDonut
            rate={s?.rts_rate ?? 0}
            returned={s?.shipped_returned_count ?? 0}
            shipped={s?.shipped_count ?? 0}
            docs={s?.rts_docs ?? 0}
            costPerDoc={s?.rts_cost_per_doc ?? 0}
            lostAmount={s?.rts_loss_amount ?? 0}
            uncollected={s?.rts_amount ?? 0}
          />
        </Card>
      </div>

      {/* Pipeline */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Orders per stage</h2>
          <span className="text-xs text-slate-400">all open orders</span>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {pipeline.map((st) => (
            <Link
              key={st.code}
              href="/orders"
              className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center transition-colors hover:border-[#2a78d6]/30 hover:bg-white"
            >
              <p className="text-2xl font-bold text-slate-900">{counts.get(st.code) ?? 0}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{st.label}</p>
            </Link>
          ))}
        </div>
        {agingCount > 0 && (
          <Link
            href="/orders"
            className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 hover:bg-red-100"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {agingCount} order{agingCount === 1 ? " is" : "s are"} stuck too long in a stage
          </Link>
        )}
      </Card>

      {/* Breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 font-semibold text-slate-900">By service</h2>
          <p className="mb-3 text-xs text-slate-500">
            Which documents earn the most — and which come back
          </p>
          <Table
            head={["Service", "Booked", "Collected", "RTS"]}
            rows={sales.byService.map((r) => [
              r.service_name,
              `${peso(r.booked_amount)} (${r.booked_count})`,
              peso(r.collected_amount),
              r.rts_docs > 0 ? `− ${peso(r.rts_loss_amount)}` : "—",
            ])}
            empty="No orders in this range."
            redLast
          />
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold text-slate-900">By courier</h2>
          <p className="mb-3 text-xs text-slate-500">Is one courier failing more?</p>
          <Table
            head={["Courier", "Shipped", "Returned", "Lost", "RTS rate"]}
            rows={sales.byCourier.map((r) => [
              r.courier_name,
              String(r.shipped_count),
              String(r.returned_count),
              r.rts_docs > 0 ? `− ${peso(r.rts_loss_amount)}` : "—",
              `${r.rts_rate}%`,
            ])}
            empty="Nothing shipped in this range."
          />
        </Card>
      </div>

      {/* Returned orders */}
      <Card>
        <h2 className="mb-1 font-semibold text-slate-900">
          Returned orders ({sales.returned.length})
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Reasons and destinations, so patterns show up
        </p>
        <Table
          head={["Customer", "Courier", "Reason", "Lost", "Returned"]}
          rows={sales.returned.map((r) => [
            r.customer_name + (r.city ? ` · ${r.city}` : ""),
            r.courier_name ?? "—",
            (r.return_reason ?? "—") +
              (r.delivery_attempts > 0 ? ` (${r.delivery_attempts}/3)` : ""),
            `− ${peso(r.loss_amount)}`,
            fmtDate(r.returned_at),
          ])}
          empty="No returns in this range. 🎉"
          redIndex={3}
        />
      </Card>
    </div>
  );
}

/* ---------- small presentational pieces ---------- */

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)] ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
  featured,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  featured?: boolean;
  tone?: "bad";
}) {
  return (
    <div
      className={`rounded-2xl p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)] ${
        featured ? "bg-[#1e3a5f] text-white" : "bg-white"
      }`}
    >
      <div className="flex items-start justify-between">
        <p
          className={`text-xs font-medium uppercase tracking-wide ${
            featured ? "text-white/70" : "text-slate-500"
          }`}
        >
          {label}
        </p>
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full ${
            featured ? "bg-[#eda100] text-white" : "bg-slate-50"
          }`}
        >
          {icon}
        </span>
      </div>
      <p
        className={`mt-3 text-2xl font-bold ${
          featured ? "text-white" : tone === "bad" ? "text-red-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      <p className={`mt-1 text-xs ${featured ? "text-white/60" : "text-slate-400"}`}>
        {sub}
      </p>
    </div>
  );
}

function Table({
  head,
  rows,
  empty,
  redLast,
  redIndex,
}: {
  head: string[];
  rows: string[][];
  empty: string;
  redLast?: boolean;
  redIndex?: number;
}) {
  const redCol = redIndex ?? (redLast ? head.length - 1 : -1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
            {head.map((h, i) => (
              <th key={h} className={`pb-2 font-medium ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-slate-100">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`py-2.5 ${ci > 0 ? "text-right" : "font-medium text-slate-800"} ${
                    ci === redCol && c !== "—" ? "text-red-600" : "text-slate-600"
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="py-8 text-center text-slate-400">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
