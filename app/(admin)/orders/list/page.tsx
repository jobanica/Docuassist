import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { PrintListButton } from "@/components/print/PrintListButton";
import { documentOwnerNames, sameParty } from "@/lib/order-people";
import { fmtDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * A muster list: one line per document, on paper.
 *
 * Distinct from /orders/print, which prints the PSA forms themselves. This is
 * the sheet that travels with the stack — the thing you hold in one hand at
 * the counter and tick down, and the thing that answers "what exactly was in
 * batch 91?" three weeks later when one of them has not come back.
 *
 * One row per document rather than per order, because that is what is being
 * counted. An order carrying a birth certificate and a CENOMAR is two pieces
 * of paper at the counter, and a list that shows it as one line will not
 * reconcile against the stack.
 *
 * RLS still applies: an account limited to certain documents gets only its own
 * orders back, however the ids arrive in the URL.
 */
export default async function OrderListPrintPage({
  searchParams,
}: {
  searchParams: { ids?: string; title?: string };
}) {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const ids = (searchParams.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));

  if (ids.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>
        <p className="mt-6 rounded-xl bg-white p-6 text-center text-sm text-slate-500">
          No orders selected. Filter the board, tick the header checkbox to take
          everything shown, then press <strong>Print list</strong>.
        </p>
      </div>
    );
  }

  const supabase = createClient();
  const [{ data: orders }, { data: history }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `id, tracking_code, created_at, status,
         customers ( full_name ),
         order_items ( id, quantity, form_details, services ( name ) )`
      )
      .in("id", ids)
      .order("created_at", { ascending: true }),
    // When each order was actually filed. status_since only knows the stage it
    // is in now, and most of a batch has long since shipped.
    supabase
      .from("order_status_history")
      .select("order_id, created_at")
      .eq("status", "processing")
      .in("order_id", ids)
      .order("created_at", { ascending: true }),
  ]);

  const filedAt = new Map<string, string>();
  for (const h of history ?? []) {
    if (!filedAt.has(h.order_id)) filedAt.set(h.order_id, h.created_at);
  }

  const rows = (orders ?? []) as any[];
  // One line per document. A quantity of 2 is two certificates in the stack,
  // so it is two lines — the list has to count what the counter counts.
  const lines = rows.flatMap((o) =>
    (o.order_items ?? []).flatMap((it: any) => {
      const customer = o.customers?.full_name ?? "—";
      // The person named on the certificate, when that is not the customer.
      const owner = documentOwnerNames((it.form_details ?? {}) as Record<string, string>)
        .map((n) => n.trim())
        .filter(Boolean)
        .find((n) => !sameParty(n, customer));
      return Array.from({ length: Math.max(1, it.quantity ?? 1) }, () => ({
        customer,
        owner: owner ?? null,
        document: it.services?.name ?? "—",
        filed: filedAt.get(o.id) ?? null,
        created: o.created_at as string,
        code: o.tracking_code as string,
      }));
    })
  );

  const title = (searchParams.title ?? "").trim().slice(0, 60);
  const printedOn = fmtDate(new Date().toISOString());

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Print list — {lines.length} document
              {lines.length === 1 ? "" : "s"}
            </h1>
            <p className="text-sm text-slate-500">
              {rows.length} order{rows.length === 1 ? "" : "s"}
              {title ? ` · ${title}` : ""} · portrait, 8.5&quot; × 11&quot;
            </p>
          </div>
          <PrintListButton count={lines.length} />
        </div>
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Set paper to Letter (8.5 × 11), layout Portrait.</strong>{" "}
              One line per document — an order with two certificates takes two
              lines, so the list counts the same as the stack. &ldquo;Date
              filed&rdquo; is the day the order reached Processing; a dash means
              it has not been filed yet.
            </span>
          </p>
        </div>
      </div>

      {/* --- The sheet ---------------------------------------------------- */}
      <div className="rounded-xl bg-white p-8 shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <header className="mb-4 border-b-2 border-slate-900 pb-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                DocuAssist PH — Document List
              </h2>
              {title && (
                <p className="text-sm font-semibold text-slate-700">{title}</p>
              )}
            </div>
            <div className="text-right text-xs text-slate-600">
              <p>
                <span className="font-semibold">{lines.length}</span> document
                {lines.length === 1 ? "" : "s"} ·{" "}
                <span className="font-semibold">{rows.length}</span> order
                {rows.length === 1 ? "" : "s"}
              </p>
              <p>Printed {printedOn}</p>
            </div>
          </div>
        </header>

        <table className="w-full border-collapse text-[11px]">
          {/* thead repeats on every printed page by default — on a 90-line
              batch that is the difference between a list and a puzzle. */}
          <thead>
            <tr className="border-b border-slate-400 text-left uppercase tracking-wide text-slate-600">
              <th className="w-8 py-1.5 pr-2 font-semibold">#</th>
              <th className="py-1.5 pr-2 font-semibold">Name</th>
              <th className="py-1.5 pr-2 font-semibold">Document</th>
              <th className="w-24 py-1.5 pr-2 font-semibold">Date filed</th>
              <th className="w-24 py-1.5 pr-2 font-semibold">Code</th>
              <th className="w-8 py-1.5 font-semibold">✓</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr
                key={`${l.code}-${i}`}
                className="break-inside-avoid border-b border-slate-200 align-top"
              >
                <td className="py-1.5 pr-2 tabular-nums text-slate-500">
                  {i + 1}
                </td>
                <td className="py-1.5 pr-2 font-medium text-slate-900">
                  {/* The certificate's own person leads when it is not the
                      customer — the counter is handing over that person's
                      document, not the person who ordered it. */}
                  {l.owner ?? l.customer}
                  {l.owner && (
                    <span className="block text-[10px] font-normal text-slate-500">
                      ordered by {l.customer}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-slate-700">{l.document}</td>
                <td className="py-1.5 pr-2 tabular-nums text-slate-700">
                  {l.filed ? fmtDate(l.filed) : "—"}
                </td>
                <td className="py-1.5 pr-2 font-mono text-[10px] text-slate-600">
                  {l.code}
                </td>
                <td className="py-1.5">
                  <span className="block h-3 w-3 border border-slate-400" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {lines.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">
            Nothing to list — those orders have no documents on them.
          </p>
        )}

        {/* A list that gets handed over is a list somebody signs for. */}
        <div className="mt-8 grid grid-cols-2 gap-10 break-inside-avoid text-[11px]">
          {["Prepared by", "Received by"].map((label) => (
            <div key={label}>
              <div className="h-8 border-b border-slate-400" />
              <p className="mt-1 text-slate-600">
                {label} — name &amp; signature / date
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
