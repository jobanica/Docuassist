import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderForm } from "@/components/order/OrderForm";
import { BrandLogo } from "@/components/track/BrandLogo";
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
      .select("id, code, name, price, online_price, form_fields, processing_days_max, shipping_days_estimate")
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
    paymentQrUrl: map.get("payment_qr_url") || null,
    paymentNote: map.get("payment_note") || null,
    logoUrl: map.get("logo_url") || null,
    // A logo that already spells out the business name is given room to be
    // read, instead of being shrunk into a square and repeated as text below.
    logoIncludesName: map.get("logo_includes_name") === "1",
    services: (services ?? []).map((s) => ({
      ...s,
      // The form quotes the prepaid price, which is what submit.ts will
      // actually charge — the two must never disagree on screen.
      price: Number(s.online_price ?? s.price),
      form_fields: (s.form_fields ?? []) as FormFieldDef[],
    })),
  };

  return (
    <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 pb-10">
      {/* The real mark, not the "DA" placeholder this shipped with. This page
          asks a stranger for their mother's maiden name and then for money —
          it has to look like the business whose ad they just tapped, and the
          landing page they came from shows the logo two seconds earlier. */}
      <header className="flex flex-col items-center gap-2 py-6 text-center">
        <BrandLogo
          src={config.logoUrl}
          name={config.businessName}
          lockup={config.logoIncludesName}
        />
        <div>
          {/* A logo that already carries the name doesn't need it again. */}
          {!config.logoIncludesName && (
            <p className="text-lg font-bold text-slate-900">
              {config.businessName}
            </p>
          )}
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
