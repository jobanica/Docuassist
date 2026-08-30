import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatusStepper } from "@/components/admin/StatusStepper";
import { OrderActions } from "@/components/admin/OrderActions";
import { TrackingPanel } from "@/components/admin/TrackingPanel";
import { PaymentToggle } from "@/components/admin/PaymentToggle";
import { ItemDetails } from "@/components/admin/ItemDetails";
import { CustomerCard } from "@/components/admin/CustomerCard";
import { listMessengerPages } from "@/lib/actions/messenger-pages";
import { qrDataUrl, trackingUrl } from "@/lib/qr";
import { peso } from "@/lib/money";
import { fmtDate, fmtDateTime, daysSince } from "@/lib/dates";
import { aging, attemptBadgeClasses } from "@/lib/status";
import type {
  Courier,
  OrderStatus,
  OrderStatusHistory,
  FormFieldDef,
  StatusCode,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const eventLabel: Record<string, string> = {
  status_change: "",
  failed_attempt: "Failed delivery attempt",
  backward_correction: "Status corrected",
};

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      `*,
       customers (*),
       couriers ( id, name, tracking_page_url ),
       order_items ( id, service_id, quantity, price_at_order, form_details,
                     pasted_details, services ( name, code, form_fields ) )`
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!order) notFound();

  const [
    { data: statuses },
    { data: history },
    { data: couriers },
    messengerPages,
    { data: parsingSetting },
  ] = await Promise.all([
      supabase.from("order_statuses").select("*").order("sort_order"),
      supabase
        .from("order_status_history")
        .select("*, staff_users ( name )")
        .eq("order_id", params.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("couriers")
        .select("*")
        .eq("active", true)
        .order("name"),
      listMessengerPages(),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "parsing_enabled")
        .maybeSingle(),
    ]);

  const o = order as any;
  const parsingEnabled = (parsingSetting?.value ?? "true") !== "false";
  const cust = o.customers;
  const statusList = (statuses ?? []) as OrderStatus[];
  const statusLabel =
    statusList.find((s) => s.code === o.status)?.label ?? o.status;
  const age = aging(o.status as StatusCode, o.status_since);
  const publicUrl = trackingUrl(o.tracking_code);
  const qr = await qrDataUrl(publicUrl);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/orders"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to orders
          </Link>
          <Link
            href={`/orders/${params.id}/print`}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1e3a5f] px-3 py-2 text-sm font-medium text-white hover:bg-[#17304f]"
          >
            <Printer className="h-4 w-4" /> PSA forms
          </Link>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{cust?.full_name}</h1>
          <StatusBadge code={o.status} label={statusLabel} />
          <span className="font-mono text-sm text-muted-foreground">
            {o.tracking_code}
          </span>
          {age === "alert" && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
              {daysSince(o.status_since)}d in {statusLabel}
            </span>
          )}
          {o.delivery_attempts > 0 && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${attemptBadgeClasses(
                o.delivery_attempts
              )}`}
            >
              Attempt {o.delivery_attempts}/3
            </span>
          )}
        </div>
      </div>

      {o.status === "cancelled" && o.cancel_reason && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm">
            <span className="font-medium text-destructive">Cancelled:</span>{" "}
            {o.cancel_reason}
          </CardContent>
        </Card>
      )}
      {o.status === "returned" && o.return_reason && (
        <Card className="border-red-300">
          <CardContent className="py-3 text-sm">
            <span className="font-medium text-red-700">Returned (RTS):</span>{" "}
            {o.return_reason}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
        {/* Left: pipeline + actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StatusStepper
                current={o.status}
                statuses={statusList}
                history={(history ?? []) as OrderStatusHistory[]}
              />
              <div className="border-t pt-4">
                <OrderActions
                  orderId={o.id}
                  status={o.status}
                  statuses={statusList}
                  couriers={(couriers ?? []) as Courier[]}
                  deliveryAttempts={o.delivery_attempts}
                  totalAmount={Number(o.total_amount)}
                />
              </div>
            </CardContent>
          </Card>

          {(o.courier_id || o.status === "delivered") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Shipping &amp; payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {o.couriers && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Info label="Courier" value={o.couriers.name} />
                      <Info
                        label="Tracking #"
                        value={o.courier_tracking_number}
                      />
                      <Info label="Shipped" value={fmtDate(o.shipped_at)} />
                      <Info label="Delivered" value={fmtDate(o.delivered_at)} />
                    </div>
                    {o.couriers.tracking_page_url && (
                      <a
                        href={o.couriers.tracking_page_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs text-primary hover:underline"
                      >
                        Open {o.couriers.name} tracking page ↗
                      </a>
                    )}
                  </>
                )}
                {o.status === "delivered" && (
                  <div className="border-t pt-3">
                    <PaymentToggle
                      orderId={o.id}
                      paid={o.payment_status === "paid"}
                      totalAmount={Number(o.total_amount)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <TrackingPanel
                publicUrl={publicUrl}
                qrDataUrl={qr}
                code={o.tracking_code}
                orderId={o.id}
                messengerPages={messengerPages.filter(
                  (p) => p.active || p.id === o.messenger_page_id
                )}
                messengerPageId={o.messenger_page_id ?? null}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right: customer + items + history */}
        <div className="space-y-6">
          <CustomerCard
            customer={cust}
            orderId={o.id}
            parsingEnabled={parsingEnabled}
            parseSource={(() => {
              // Auto-fill reads whichever item actually carries a pasted reply.
              const withPaste = (o.order_items ?? []).find(
                (it: any) => it.pasted_details?.trim()
              );
              return withPaste
                ? { text: withPaste.pasted_details, serviceId: withPaste.service_id }
                : null;
            })()}
          />

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Items</CardTitle>
              <span className="text-sm font-semibold">
                Total: {peso(o.total_amount)}
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {o.order_items.map((it: any) => {
                const fields: FormFieldDef[] = it.services?.form_fields ?? [];
                return (
                  <div key={it.id} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-medium">
                        {it.services?.name}
                        {it.quantity > 1 && (
                          <span className="text-muted-foreground">
                            {" "}
                            × {it.quantity}
                          </span>
                        )}
                      </p>
                      <span className="text-sm text-muted-foreground">
                        {peso(Number(it.price_at_order) * it.quantity)}
                      </span>
                    </div>
                    <ItemDetails
                      itemId={it.id}
                      orderId={o.id}
                      serviceId={it.service_id}
                      parsingEnabled={parsingEnabled}
                      fields={fields}
                      formDetails={(it.form_details ?? {}) as Record<string, string>}
                      pastedDetails={it.pasted_details ?? null}
                    />
                  </div>
                );
              })}
              {(o.expected_release_date || o.expected_delivery_date) && (
                <div className="grid grid-cols-2 gap-4 border-t pt-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Expected release</p>
                    <p>{fmtDate(o.expected_release_date)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Expected delivery</p>
                    <p>{fmtDate(o.expected_delivery_date)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {(history ?? []).map((h: any) => (
                  <li key={h.id} className="flex gap-3 text-sm">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div>
                      <p>
                        {eventLabel[h.event_type]
                          ? `${eventLabel[h.event_type]}`
                          : statusList.find((s) => s.code === h.status)?.label ??
                            h.status}
                        {h.event_type === "failed_attempt" &&
                          h.attempt_number &&
                          ` (${h.attempt_number}/3)`}
                      </p>
                      {h.note && (
                        <p className="text-xs text-muted-foreground">{h.note}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {fmtDateTime(h.created_at)}
                        {h.staff_users?.name && ` · ${h.staff_users.name}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  full,
}: {
  label: string;
  value: string | null | undefined;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <p className="text-muted-foreground">{label}</p>
      <p>{value || "—"}</p>
    </div>
  );
}
