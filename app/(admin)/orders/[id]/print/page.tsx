import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { PsaForm, findOverflows } from "@/components/print/PsaForm";
import { PrintActions } from "@/components/print/PrintActions";
import { PSA_FORMS } from "@/lib/psa-forms";

export const dynamic = "force-dynamic";

export default async function PrintFormsPage({
  params,
}: {
  params: { id: string };
}) {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const supabase = createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      `id, tracking_code,
       customers ( full_name ),
       order_items ( id, form_details, pasted_details, services ( code, name ) )`
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!order) notFound();
  const o = order as any;
  const customerName = o.customers?.full_name ?? "—";
  const items = (o.order_items ?? []) as any[];

  return (
    <div className="space-y-5">
      {/* Everything here is hidden when printing — only the forms go on paper */}
      <div className="print:hidden">
        <Link
          href={`/orders/${params.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to order
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          PSA application forms
        </h1>
        <p className="text-sm text-slate-500">
          {customerName} ·{" "}
          <span className="font-mono">{o.tracking_code}</span> · filled from the
          details encoded on this order
        </p>
      </div>

      <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 print:hidden">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Check before filing.</strong> PSA prints each form on its own
            colour of paper (birth on white, CENOMAR green, marriage pink, death
            yellow). A replica printed on plain paper may not be accepted over
            the counter — confirm with your PSA branch. Sending the image to the
            customer to confirm their details works regardless.
          </span>
        </p>
      </div>

      {items.map((item, i) => {
        const code = item.services?.code ?? "";
        const domId = `psa-form-${i}`;
        const details = (item.form_details ?? {}) as Record<string, string>;
        const hasDetails = Object.values(details).some((v) => v?.trim());
        const overflows = findOverflows(code, details);
        return (
          <section key={item.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div>
                <h2 className="font-semibold text-slate-900">
                  {item.services?.name}
                </h2>
                {PSA_FORMS[code] && (
                  <p className="text-xs text-slate-500">
                    Official paper colour: {PSA_FORMS[code].paper}
                  </p>
                )}
              </div>
              <PrintActions targetId={domId} />
            </div>

            {!hasDetails && (
              <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 print:hidden">
                <p className="font-semibold">
                  This form will print blank.
                </p>
                <p className="mt-1">
                  The PSA form fields on this item are empty. Open{" "}
                  <Link
                    href={`/orders/${params.id}`}
                    className="font-medium underline"
                  >
                    the order
                  </Link>{" "}
                  and fill <strong>PSA form fields</strong> — the
                  customer&apos;s reply is shown right above them to copy from.
                </p>
                {item.pasted_details && (
                  <pre className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-700">
                    {item.pasted_details}
                  </pre>
                )}
              </div>
            )}

            {overflows.length > 0 && (
              <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800 print:hidden">
                <p className="font-semibold">
                  {overflows.length} value{overflows.length === 1 ? "" : "s"} too
                  long for the form and will be cut off:
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {overflows.map((v) => (
                    <li key={v.label}>
                      <strong>{v.label}</strong> — &ldquo;{v.value}&rdquo; is{" "}
                      {v.value.length} characters, the form has {v.boxes} boxes.
                    </li>
                  ))}
                </ul>
                <p className="mt-1">
                  Shorten it on the order before filing, or write that field by
                  hand.
                </p>
              </div>
            )}

            {/* The printable sheet. Scrolls horizontally on small screens
                rather than squashing the fixed-width form. */}
            <div className="overflow-x-auto print:overflow-visible">
              <div
                id={domId}
                // w-fit so the box hugs the 760px form. As a plain block it
                // stretched to the container, and "Copy image" captured that
                // width — sending the customer a form with blank space beside it.
                className={`psa-sheet w-fit${i === 0 ? " psa-first" : ""}`}
              >
                <PsaForm
                  serviceCode={code}
                  serviceName={item.services?.name ?? "Document"}
                  details={details}
                  trackingCode={o.tracking_code}
                  customerName={customerName}
                />
              </div>
            </div>
          </section>
        );
      })}

      {items.length === 0 && (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500">
          This order has no items to print.
        </p>
      )}
    </div>
  );
}
