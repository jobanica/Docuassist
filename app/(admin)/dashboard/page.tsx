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
import { fetchAll } from "@/lib/supabase/fetch-all";
import { peso } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { aging } from "@/lib/status";
import type { StatusCode } from "@/lib/types";

export const dynamic = "force-dynamic";

const PIPELINE_CODES = [
  "new_inquiry", "details_received", "processing", "released", "shipped",
  "out_for_delivery", "delivered",
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
    // Paged. Every order counts towards the stage tallies and the "stuck too
    // long" warning, and a capped read made both quietly understate once the
    // table passed a thousand rows.
    fetchAll<any>((from, to) =>
      supabase
        .from("orders")
        .select("id, status, status_since", { count: "exact" })
        .order("id")
        .range(from, to)
    ),
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
          sub={[
            `${s?.booked_count ?? 0} orders encoded`,
            (s?.cancelled_count ?? 0) > 0
              ? `${s?.cancelled_count} cancelled not counted`
              : null,
            // Already out of the figure above — shown so what was given away
            // to keep the regulars has a number against it.
            (s?.discount_amount ?? 0) > 0
              ? `${peso(s?.discount_amount ?? 0)} discounted on ${
                  s?.discount_count
                }`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
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
              : "nothing lost"
          }
          tone="bad"
        />
        <Stat
          icon={<Ban className="h-4 w-4 text-slate-400" />}
          label="Net sales"
          value={peso(s?.net_amount ?? 0)}
          sub={
            (s?.rts_count ?? 0) > 0
              ? `booked less ${s?.rts_count} lost`
              : "nothing lost to deduct"
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

      {/* Per batch — the unit of work the office actually plans around */}
      <Card>
        <h2 className="mb-1 font-semibold text-slate-900">By batch</h2>
        <p className="mb-3 text-xs text-slate-500">
          Whole-batch figures, so these ignore the date filter above — a batch
          is a unit of work, not a window of time. Each row subtracts across:{" "}
          <strong>collected − doc cost − RTS cost = net profit</strong>, at{" "}
          {peso(sales.summary?.rts_cost_per_doc ?? 0)} a document. That cost is
          spent the moment a document is filed, so a batch still in transit
          reads as a loss and climbs as the deliveries land.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">Batch</th>
                <th className="pb-2 text-right font-medium">Docs</th>
                <th className="pb-2 text-right font-medium">Collected</th>
                <th className="pb-2 text-right font-medium">Doc cost</th>
                <th className="pb-2 text-right font-medium">Lost cost</th>
                <th className="pb-2 text-right font-medium">Net profit</th>
                <th className="pb-2 text-right font-medium">Unpaid</th>
                <th className="pb-2 text-right font-medium">RTS rate</th>
              </tr>
            </thead>
            <tbody>
              {sales.byBatch.map((b) => (
                <tr key={b.batch_name} className="border-t border-slate-100">
                  <td className="py-2.5 font-medium text-slate-800">
                    {b.batch_name}
                    <span className="ml-1.5 text-xs font-normal text-slate-400">
                      {b.orders} order{b.orders === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-slate-600">{b.docs}</td>
                  <td className="py-2.5 text-right text-slate-600">
                    {peso(b.collected_amount)}
                  </td>
                  {/* Prices the documents that are still earning or already
                      earned — the written-off ones are the column to its
                      right. Spelled out because "119 docs" beside a cost for
                      103 of them is a fair thing to be puzzled by. */}
                  <td className="py-2.5 text-right text-slate-500">
                    − {peso(b.doc_cost_amount)}
                    <span className="block text-[10px] text-slate-400">
                      {[
                        b.delivered_docs > 0
                          ? `${b.delivered_docs} delivered`
                          : null,
                        b.inflight_docs > 0
                          ? `${b.inflight_docs} in transit`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </td>
                  {/* Cash burnt on documents that earned nothing, whatever
                      killed the sale. Carved out of the cost above rather
                      than added to it, so the row still subtracts to the same
                      bottom line. The kinds are spelled out underneath: a
                      batch can carry a real loss here and still show a 0%
                      return rate, because a customer who blocked us never
                      gave the courier a chance to fail. */}
                  <td
                    className={`py-2.5 text-right ${
                      b.rts_cost_amount > 0 ? "text-red-600" : "text-slate-400"
                    }`}
                  >
                    {b.rts_cost_amount > 0 ? (
                      <>
                        − {peso(b.rts_cost_amount)}
                        <span className="block text-[10px] font-normal text-slate-400">
                          {[
                            b.returned_count > 0
                              ? `${b.returned_count} returned`
                              : null,
                            b.blocked_count > 0
                              ? `${b.blocked_count} blocked`
                              : null,
                            b.rejected_count > 0
                              ? `${b.rejected_count} refused`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  {/* The one figure worth colouring: whether this batch is
                      ahead or still underwater. */}
                  <td
                    className={`py-2.5 text-right font-semibold ${
                      b.profit_amount < 0 ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {b.profit_amount < 0 ? "− " : "+ "}
                    {peso(Math.abs(b.profit_amount))}
                  </td>
                  <td
                    className={`py-2.5 text-right ${
                      b.lost_amount > 0 ? "text-red-600" : "text-slate-400"
                    }`}
                  >
                    {b.lost_amount > 0
                      ? `${peso(b.lost_amount)} (${b.lost_count})`
                      : "—"}
                  </td>
                  {/* Nothing shipped yet means no rate to quote, not 0%. */}
                  <td className="py-2.5 text-right text-slate-600">
                    {b.shipped_count === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span
                        className={
                          b.rts_rate >= 10
                            ? "font-medium text-red-600"
                            : b.rts_rate >= 5
                              ? "font-medium text-amber-700"
                              : ""
                        }
                      >
                        {b.rts_rate}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {sales.byBatch.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No batches tagged yet. Tag a customer on the orders board
                    and their orders land here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Said once, here, rather than left for someone to discover by
            adding the columns up and finding they overshoot. */}
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          <strong>Docs</strong> is every document the batch is charged for, and
          it splits across the two cost columns: Doc cost prices the delivered
          and in-transit ones, Lost cost the written-off ones. Together they
          are the whole batch. Cancelled orders are charged to neither, the
          same way they are left out of revenue everywhere else.
          <br />
          <strong>Lost cost</strong> and <strong>Unpaid</strong> count all
          three ways a sale dies — the parcel came back, the customer blocked
          us, or they refused it at the door. A document costs its{" "}
          {peso(sales.summary?.rts_cost_per_doc ?? 0)} either way.{" "}
          <strong>RTS rate</strong> is narrower on purpose: returned over
          shipped, which answers whether the courier is failing. A batch can
          show a real Lost cost against a 0% rate, because a customer who
          blocked us never gave the courier a chance to fail.
          <br />
          <strong>Unpaid</strong> is the sale price those lost orders would
          have fetched. It sits outside the subtraction on purpose: the money
          never arrived, so it was never in Collected, and taking it off again
          would charge the business twice for one loss — the cash actually
          burnt is the Lost cost column.
          <br />
          Batches are tags on customers, so a customer in two batches has their
          order counted under both — these rows will not sum to the figures
          above. Newest 24 batches.
        </p>
      </Card>

      {/* Returned orders */}
      <Card>
        <h2 className="mb-1 font-semibold text-slate-900">
          Lost orders ({sales.returned.length})
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Parcels that came back, customers we could not reach, and deliveries
          refused at the door — reasons and destinations, so patterns show up
        </p>
        <Table
          head={["Customer", "How", "Reason", "Lost", "Date"]}
          rows={sales.returned.map((r) => [
            r.customer_name + (r.city ? ` · ${r.city}` : ""),
            // Neither a blocked nor a refused order is the courier's doing,
            // so naming one would point the finger at the wrong party — and
            // "—" would read as missing data rather than as the real answer.
            r.blocked
              ? "Blocked"
              : r.rejected
                ? "Refused"
                : r.courier_name ?? "—",
            (r.return_reason ?? "—") +
              (r.delivery_attempts > 0 ? ` (${r.delivery_attempts}/3)` : ""),
            `− ${peso(r.loss_amount)}`,
            fmtDate(r.returned_at),
          ])}
          empty="Nothing lost in this range. 🎉"
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
