import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { PsaForm, findOverflows } from "@/components/print/PsaForm";
import { PrintAllButton } from "@/components/print/PrintAllButton";
import { PSA_FORMS } from "@/lib/psa-forms";

export const dynamic = "force-dynamic";

/**
 * Every selected order's PSA forms, one document per sheet, in a single print.
 *
 * Staff file a stack at the PSA counter in one trip, so printing them one
 * order at a time is a browser dialog per order. RLS still applies — an
 * account limited to certain documents gets only its own orders back, however
 * the ids arrive in the URL.
 */
export default async function BatchPrintPage({
  searchParams,
}: {
  searchParams: { ids?: string };
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
          No orders selected. Tick the orders you want on the Orders board, then
          press <strong>Print forms</strong>.
        </p>
      </div>
    );
  }

  const supabase = createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select(
      `id, tracking_code, created_at,
       customers ( full_name ),
       order_items ( id, form_details, pasted_details, services ( code, name ) )`
    )
    .in("id", ids)
    .order("created_at", { ascending: true });

  const rows = (orders ?? []) as any[];
  // Flatten to one printable sheet per document, which is what goes on paper.
  const all = rows.flatMap((o) =>
    (o.order_items ?? []).map((item: any) => ({
      order: o,
      item,
      code: (item.services?.code ?? "") as string,
      details: (item.form_details ?? {}) as Record<string, string>,
    }))
  );
  // Only documents that actually have a PSA form. A TIN or PhilHealth ID has
  // none, and a page of nothing per ID order is wasted paper.
  const sheets = all.filter((s) => PSA_FORMS[s.code]);
  const skipped = all.filter((s) => !PSA_FORMS[s.code]);
  const blank = sheets.filter(
    (s) => !Object.values(s.details).some((v) => String(v ?? "").trim())
  );
  // Two document requests print side by side on one landscape sheet, which is
  // how PSA hands the forms out — one sheet, cut down the middle.
  const pairs: (typeof sheets)[] = [];
  for (let i = 0; i < sheets.length; i += 2) pairs.push(sheets.slice(i, i + 2));

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
              Print {sheets.length} form{sheets.length === 1 ? "" : "s"}
            </h1>
            <p className="text-sm text-slate-500">
              {rows.length} order{rows.length === 1 ? "" : "s"} ·{" "}
              {pairs.length} sheet{pairs.length === 1 ? "" : "s"}, two documents
              per sheet, 8.5&quot; × 11&quot;
            </p>
          </div>
          <PrintAllButton count={sheets.length} />
        </div>
      </div>

      <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 print:hidden">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>
              Set paper to Letter (8.5 × 11), layout Landscape, and scale to
              100%.
            </strong>{" "}
            &ldquo;Fit to page&rdquo; shrinks the character boxes off the grid.
            Two forms print per sheet — cut down the middle. PSA prints each
            form on its own colour of paper: birth white, CENOMAR green,
            marriage pink, death yellow.
          </span>
        </p>
      </div>

      {blank.length > 0 && (
        <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800 print:hidden">
          <p className="font-semibold">
            {blank.length} form{blank.length === 1 ? "" : "s"} will print blank
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {blank.map((s) => (
              <li key={s.item.id}>
                <Link
                  href={`/orders/${s.order.id}`}
                  className="font-medium underline"
                >
                  {s.order.customers?.full_name ?? "—"}
                </Link>{" "}
                — {s.item.services?.name}: no PSA form fields filled in.
              </li>
            ))}
          </ul>
        </div>
      )}

      {skipped.length > 0 && (
        <p className="rounded-xl bg-slate-100 p-3 text-xs text-slate-600 print:hidden">
          Not printed — no PSA form exists for{" "}
          {Array.from(new Set(skipped.map((s) => s.item.services?.name))).join(", ")}
          . Those are handled over the counter, not on a PSA application form.
        </p>
      )}

      {pairs.map((pair, pi) => (
        <div
          key={pi}
          className={`psa-pair space-y-5${pi === 0 ? " psa-first" : ""}`}
        >
          {pair.map((s, hi) => {
            const i = pi * 2 + hi;
            const code = s.code;
            const name = s.order.customers?.full_name ?? "—";
            const overflows = findOverflows(code, s.details);
            return (
              <section key={s.item.id} className="psa-half space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                  <p className="text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{name}</span> ·{" "}
                    {s.item.services?.name} ·{" "}
                    <span className="font-mono text-xs">
                      {s.order.tracking_code}
                    </span>
                    {PSA_FORMS[code] && (
                      <span className="text-slate-400">
                        {" "}
                        · {PSA_FORMS[code].paper} paper
                      </span>
                    )}
                  </p>
                  <span className="text-xs text-slate-400">
                    form {i + 1} of {sheets.length} · sheet {pi + 1}
                  </span>
                </div>

                {overflows.length > 0 && (
                  <p className="rounded-lg bg-red-50 p-2 text-xs text-red-800 print:hidden">
                    Too long for the boxes and will be cut off:{" "}
                    {overflows
                      .map((v) => `${v.label} (${v.value.length}/${v.boxes})`)
                      .join(", ")}
                  </p>
                )}

                <div className="overflow-x-auto print:overflow-visible">
                  <div className="psa-scale w-fit">
                    <PsaForm
                      serviceCode={code}
                      serviceName={s.item.services?.name ?? "Document"}
                      details={s.details}
                      trackingCode={s.order.tracking_code}
                      customerName={name}
                    />
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      ))}

      {sheets.length === 0 && (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500">
          Those orders have no documents to print.
        </p>
      )}
    </div>
  );
}
