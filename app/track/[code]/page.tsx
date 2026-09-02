import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  AlertTriangle,
  Ban,
  FileText,
  PackageX,
  Search,
  Clock,
} from "lucide-react";
import {
  lookupTracking,
  getBusinessInfo,
  getPublicPipeline,
  clientIp,
} from "@/lib/tracking";
import { TrackShell } from "@/components/track/TrackShell";
import { PublicStepper } from "@/components/track/PublicStepper";
import { ArrivalHero } from "@/components/track/ArrivalHero";
import { CourierTracking } from "@/components/track/CourierTracking";
import {
  statusHelper,
  attemptNotice,
  statusPillClasses,
  NO_CANCELLATION,
} from "@/lib/publicCopy";
import { peso } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * The person a document is for, marked so it can be found at a glance.
 *
 * Amber rather than the brand navy: it sits inside running text, and a second
 * strong colour there would compete with the status badge below it, which is
 * the thing the page exists to answer.
 */
// box-decoration-clone so a name that wraps keeps its rounded ends on both
// lines instead of one long ragged block.
const OWNER_MARK =
  "box-decoration-clone rounded bg-[#eda100]/25 px-1.5 py-0.5 " +
  "font-bold text-slate-900";

/** One consistent card, so every block on the page reads as the same system. */
const CARD = "rounded-2xl bg-white shadow-[0_4px_20px_rgba(16,24,40,0.08)]";

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

  if (result.kind === "rate_limited") {
    return (
      <TrackShell business={business} subtitle="Track your order">
        <div className={`${CARD} p-6 text-center`}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <Clock className="h-7 w-7 text-amber-600" />
          </div>
          <p className="mt-3 font-bold text-slate-900">Sandali lang po 🙏</p>
          <p className="mt-1 text-sm text-slate-500">
            Too many requests right now. Please wait a minute and refresh.
          </p>
        </div>
      </TrackShell>
    );
  }

  if (result.kind === "not_found") {
    return (
      <TrackShell
        business={business}
        subtitle="Track your order"
        messengerUrl={business.messenger_url}
      >
        <div className={`${CARD} p-6 text-center`}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <PackageX className="h-7 w-7 text-slate-400" />
          </div>
          <p className="mt-3 font-bold text-slate-900">Order not found</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            Double-check your link, or search using the mobile number you
            ordered with.
          </p>
          <a
            href="/track"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#16304f]"
          >
            <Search className="h-4 w-4" />
            Search by phone number
          </a>
        </div>
      </TrackShell>
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
    <TrackShell
      business={business}
      subtitle="Track your order"
      messengerUrl={info.messenger?.url ?? business.messenger_url}
      messengerName={info.messenger?.name ?? null}
    >
      {/* The answer they came for, before anything else. */}
      <ArrivalHero info={info} />

      {/* A held-up job goes above the status, because it changes what the
          arrival date means. The reason is the supplier's own words — the
          person who actually knows — so it is shown rather than paraphrased. */}
      {info.is_delayed && (
        <section className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <p className="flex items-center gap-2 font-bold text-amber-900">
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
      <section className={`mt-3 ${CARD} p-5 text-center`}>
        <p className="leading-relaxed text-slate-900">
          Hi <span className="font-bold">{info.first_name ?? "there"}</span>!
          Here&apos;s the status of your{" "}
          {info.documents.length === 1 ? (
            <>
              <span className="font-semibold">
                {info.documents[0].service_name}
              </span>
              {info.documents[0].owner_name ? (
                <>
                  {" for "}
                  {/* Highlighted, because on an order carrying more than one
                      certificate the person is the only thing telling them
                      apart — it is what the customer is actually scanning for. */}
                  <span className={OWNER_MARK}>
                    {info.documents[0].owner_name}
                  </span>
                  .
                </>
              ) : (
                "."
              )}
            </>
          ) : info.documents.length > 1 ? (
            <>
              <span className="font-semibold">
                {info.documents.length} documents
              </span>
              , sent together in one parcel.
            </>
          ) : (
            <span className="font-semibold">order.</span>
          )}
        </p>

        {/* Named one per line once there is more than one: on an order for two
            birth certificates the person is the only thing telling them
            apart, and a sentence listing both reads as a run-on. */}
        {info.documents.length > 1 && (
          <ul className="mx-auto mt-4 max-w-sm space-y-1.5 text-left">
            {info.documents.map((d, n) => (
              <li
                key={n}
                className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>
                  <span className="font-semibold text-slate-900">
                    {d.service_name}
                  </span>
                  {d.owner_name && (
                    <>
                      <br />
                      for <span className={OWNER_MARK}>{d.owner_name}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Coloured by stage rather than always blue, so the badge agrees with
            the stepper below and the arrival card above. */}
        <p
          className={`mt-4 inline-flex items-center rounded-full px-5 py-2 text-lg font-bold ring-4 ${statusPillClasses(
            info.status
          )}`}
        >
          {info.status_label}
        </p>
        {helper && (
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{helper}</p>
        )}
      </section>

      {/* Failed-attempt / RTS notice */}
      {notice && (
        <section
          className={`mt-3 rounded-2xl border p-4 text-sm leading-relaxed shadow-sm ${
            notice.strong
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {notice.text}
        </section>
      )}
      {info.status === "returned" && (
        <section className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-800 shadow-sm">
          {helper}
        </section>
      )}

      {/* COD reminder */}
      {showCod && (
        <section className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            Prepare for cash on delivery
          </p>
          <p className="mt-1 text-3xl font-extrabold text-emerald-700">
            {peso(info.total_amount)}
          </p>
          {/* Someone promised ₱100 off should see the ₱100, not just a
              smaller number than the one they were quoted. */}
          {info.discount_amount > 0 && (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              {peso(info.discount_amount)} discount already applied
            </p>
          )}
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
      <section className={`mt-3 ${CARD} p-5`}>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
          Progress
        </h2>
        <PublicStepper pipeline={pipeline} info={info} />
      </section>

      {/* The cancellation policy, while it can still be acted on. An order
          already delivered, returned or cancelled is past the point where
          telling someone they may not cancel means anything — on a cancelled
          one it would be pointed. */}
      {!info.is_terminal && (
        <section className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-red-800">
            <Ban className="h-4 w-4 shrink-0" />
            {NO_CANCELLATION.heading}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-red-900">
            {NO_CANCELLATION.body}
          </p>
        </section>
      )}

      {/* A customer who lands here from an old link often has other orders
          too — this is the way across to them. */}
      <a
        href="/track"
        className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#1e3a5f] shadow-sm transition hover:bg-slate-50"
      >
        <Search className="h-4 w-4" />
        Track my other orders
      </a>
    </TrackShell>
  );
}
