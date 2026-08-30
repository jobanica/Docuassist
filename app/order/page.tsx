import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderForm } from "@/components/order/OrderForm";
import type { FormFieldDef } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Request a document · DocuAssist PH",
  description: "Order PSA certificates and government IDs online, delivered COD.",
};

export default async function PublicOrderPage() {
  // Read directly on the server so the form renders filled in on first paint —
  // no client fetch, no loading flash on a slow mobile connection.
  const db = createAdminClient();
  const [{ data: services }, { data: settings }, { data: page }] = await Promise.all([
    db
      .from("services")
      .select("id, code, name, price, form_fields, processing_days_max, shipping_days_estimate")
      .eq("active", true)
      .order("sort_order")
      .order("name"),
    db.from("app_settings").select("key, value"),
    // The default page, same one the tracking pages fall back to.
    db
      .from("messenger_pages")
      .select("url")
      .eq("is_default", true)
      .eq("active", true)
      .maybeSingle(),
  ]);

  const map = new Map((settings ?? []).map((r) => [r.key, r.value ?? ""]));
  const config = {
    enabled: (map.get("public_orders_enabled") ?? "true") !== "false",
    otpRequired: (map.get("otp_required") ?? "true") !== "false",
    businessName: map.get("business_name") || "DocuAssist PH",
    messengerUrl: page?.url || map.get("messenger_url") || null,
    services: (services ?? []).map((s) => ({
      ...s,
      price: Number(s.price),
      form_fields: (s.form_fields ?? []) as FormFieldDef[],
    })),
  };

  return (
    <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 pb-10">
      <header className="flex flex-col items-center gap-2 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
          DA
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">{config.businessName}</p>
          <p className="text-sm text-slate-500">Request a document online</p>
        </div>
      </header>

      {!config.enabled ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="font-semibold text-slate-900">
            Online ordering is closed right now
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Please message our page and we&apos;ll take your request there po.
          </p>
          {config.messengerUrl && (
            <a
              href={config.messengerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white"
            >
              <MessageCircle className="h-4 w-4" /> Message us on Facebook
            </a>
          )}
        </div>
      ) : config.services.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          No documents are being offered at the moment.
        </div>
      ) : (
        <OrderForm config={config} />
      )}
    </main>
  );
}
