import type { Metadata } from "next";
import { headers } from "next/headers";
import { AlertTriangle, MessageCircle, PackageX, ShieldCheck } from "lucide-react";
import {
  lookupTracking,
  getBusinessInfo,
  getPublicPipeline,
  clientIp,
} from "@/lib/tracking";
import { PublicStepper } from "@/components/track/PublicStepper";
import { ArrivalHero } from "@/components/track/ArrivalHero";
import { CourierTracking } from "@/components/track/CourierTracking";
import { statusHelper, attemptNotice, statusPillClasses } from "@/lib/publicCopy";
import { peso } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track your order · DocuAssist PH",
  robots: { index: false, follow: false },
};

export default async function TrackPage({
  params,
}: {
  params: { code: string };
}) {
  const ip = clientIp(headers());
  const [result, business] = await Promise.all([
    lookupTracking(params.code, ip),
    getBusinessInfo(),
  ]);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 pb-10">
      <header className="flex flex-col items-center gap-2 py-6 text-center">
        {business.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={business.logo_url}
            alt={business.business_name}
            className="h-12 w-auto"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
            DA
          </div>
        )}
        <div>
          <p className="text-lg font-bold text-slate-900">
            {business.business_name}
          </p>
          <p className="text-sm text-slate-500">Track your order</p>
        </div>
      </header>
      {children}
    </main>
  );

  if (result.kind === "rate_limited") {
    return (
      <Shell>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="font-semibold text-slate-900">Sandali lang po 🙏</p>
          <p className="mt-1 text-sm text-slate-500">
            Too many requests right now. Please wait a minute and refresh.
          </p>
        </div>
      </Shell>
    );
  }

  if (result.kind === "not_found") {
    return (
      <Shell>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <PackageX className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-900">Order not found</p>
          <p className="mt-1 text-sm text-slate-500">
            Double-check your link, or message our page and we&apos;ll help you
            po.
          </p>
          <MessengerButton url={business.messenger_url} />
        </div>
        <PrivacyNote />
      </Shell>
    );
  }

  const info = result.data;
  const pipeline = await getPublicPipeline();
  const helper = statusHelper(info);
  const notice = attemptNotice(info);
  const showCod =
    (info.status === "shipped" || info.status === "delivered") &&
    info.payment_status !== "paid";

  return (
    <Shell>
      {/* The answer they came for, before anything else. */}
      <ArrivalHero info={info} />

      {/* A held-up job goes above the status, because it changes what the
          arrival date means. The reason is the supplier's own words — the
          person who actually knows — so it is shown rather than paraphrased. */}
      {info.is_delayed && (
        <section className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            There&apos;s a delay on this one
          </p>
          {info.delay_reason && (
            <p className="mt-2 text-sm leading-relaxed text-amber-900">
              {info.delay_reason}
            </p>
          )}
          <p className="mt-3 text-xs text-amber-800/80">
            We&apos;re on it — the dates below may move. Message us if you need
            anything.
          </p>
        </section>
      )}

      {/* Summary. Centred so the status badge lands in the middle of the
          card — after the arrival date it is the thing being looked for, and
          left-aligned at 14px it read as a label rather than an answer. */}
      <section className="mt-4 rounded-2xl bg-white p-5 text-center shadow-sm">
        <p className="text-slate-900">
          Hi <span className="font-semibold">{info.first_name ?? "there"}</span>!
          Here&apos;s the status of your{" "}
          <span className="font-semibold">
            {info.service_names.join(", ") || "order"}
          </span>{" "}
          order.
        </p>
        {/* Coloured by stage rather than always blue, so the badge agrees with
            the stepper below and the arrival card above. */}
        <p
          className={`mt-3 inline-flex items-center rounded-full px-5 py-2 text-lg font-bold ring-4 ${statusPillClasses(
            info.status
          )}`}
        >
          {info.status_label}
        </p>
        {helper && <p className="mt-3 text-sm text-slate-600">{helper}</p>}
      </section>

      {/* Failed-attempt / RTS notice */}
      {notice && (
        <section
          className={`mt-4 rounded-2xl p-4 text-sm shadow-sm ${
            notice.strong
              ? "bg-red-50 text-red-800"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {notice.text}
        </section>
      )}
      {info.status === "returned" && (
        <section className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800 shadow-sm">
          {helper}
        </section>
      )}

      {/* COD reminder */}
      {showCod && (
        <section className="mt-4 rounded-2xl bg-emerald-50 p-4 text-center shadow-sm">
          <p className="text-sm text-emerald-800">Prepare for cash on delivery</p>
          <p className="text-2xl font-bold text-emerald-700">
            {peso(info.total_amount)}
          </p>
        </section>
      )}

      {/* Courier: copy the number, then open the courier's tracking page (§7).
          Hidden entirely when no courier info was entered. */}
      {info.courier && (
        <CourierTracking
          courierName={info.courier.name}
          trackingNumber={info.courier.tracking_number}
          trackingPageUrl={info.courier.tracking_page_url}
        />
      )}

      {/* Stepper */}
      <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
        <PublicStepper pipeline={pipeline} info={info} />
      </section>

      {/* Footer — the page named on this order, not one global link, so the
          customer reaches the staff who actually handle their document. */}
      <section className="mt-6 text-center">
        <p className="text-sm text-slate-500">May tanong po kayo?</p>
        <MessengerButton
          url={info.messenger?.url ?? business.messenger_url}
          name={info.messenger?.name ?? null}
        />
      </section>
      <PrivacyNote />
    </Shell>
  );
}

function MessengerButton({
  url,
  name,
}: {
  url: string | null;
  /** Named when the order points at a page other than the main one, so the
   *  customer isn't surprised by which inbox opens. */
  name?: string | null;
}) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
    >
      <MessageCircle className="h-4 w-4" />
      {name ? `Message ${name}` : "Message us on Facebook"}
    </a>
  );
}

function PrivacyNote() {
  return (
    <p className="mt-8 flex items-start gap-2 px-2 text-center text-xs text-slate-400">
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        We protect your personal data under the Data Privacy Act of 2012. This
        page shows only your first name and order status — never your full
        details.
      </span>
    </p>
  );
}
