import type { Metadata } from "next";
import {
  Check,
  Clock,
  MapPin,
  MessageSquare,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";
import { ProofGallery } from "@/components/landing/ProofGallery";
import { Faq } from "@/components/landing/Faq";
import { StickyCta, MessengerIcon } from "@/components/landing/StickyCta";
import {
  MESSENGER_URL,
  FACEBOOK_URL,
  PRICE_STANDARD,
  PRICE_CENOMAR,
  PRICE_FROM,
  PROOF_STATS,
} from "@/lib/landing";

/* The landing page is the one page here meant to be found and shared, so it
   carries its own metadata — the rest of the app is deliberately noindex. */
/* Facebook needs absolute URLs for the OG card. Without this, Next falls back
   to localhost and the ad preview silently ships with a broken image — set
   NEXT_PUBLIC_SITE_URL once a custom domain replaces the vercel.app one. */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://docuassist.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: `DocuAssist PH — PSA Certificates Delivered to Your Door | from ${PRICE_FROM}`,
  description: `Order your PSA Birth Certificate, Marriage or Death Certificate (${PRICE_FROM}) or CENOMAR (₱${PRICE_CENOMAR}) online. All-in pricing, processed for you, delivered nationwide. No lines. No leave filed.`,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "DocuAssist PH",
    title: `PSA Certificates Delivered to Your Door — from ${PRICE_FROM}`,
    description: `Order your PSA Birth Certificate, Marriage or Death Certificate (${PRICE_FROM}) or CENOMAR (₱${PRICE_CENOMAR}) online. All-in pricing, processed for you, delivered nationwide. No lines. No leave filed.`,
  },
  twitter: {
    card: "summary_large_image",
    title: `PSA Certificates Delivered to Your Door — from ${PRICE_FROM}`,
    description: `All-in pricing, processed for you, delivered nationwide. No lines. No leave filed.`,
  },
};

const NAVY = "#14406F";

/** Every CTA on the page is this button. One page, one action. */
function Cta({
  children,
  id,
  className = "",
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <a
      id={id}
      href={MESSENGER_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#1E86C7] px-6 py-4 text-[16px] font-semibold text-white shadow-lg shadow-[#1E86C7]/25 transition hover:bg-[#1a72aa] active:scale-[0.99] ${className}`}
    >
      <MessengerIcon />
      {children}
    </a>
  );
}

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`px-4 py-14 md:py-20 ${className}`}>
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <main className="bg-white text-slate-800 antialiased">
      {/* ---------- 1. Hero ---------- */}
      <div className="bg-gradient-to-b from-[#0F3A66] to-[#14406F] text-white">
        <div className="mx-auto w-full max-w-5xl px-4 pb-14 pt-10 md:pb-20 md:pt-16">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-medium text-white/90">
                🇵🇭 Serving customers nationwide · Legit PSA documents
              </p>
              <h1 className="mt-5 text-[30px] font-extrabold leading-[1.15] tracking-tight md:text-5xl">
                Get your PSA certificate without falling in line.
              </h1>
              <p className="mt-4 text-[16px] leading-relaxed text-white/80 md:text-lg">
                We process your PSA Birth Certificate, Marriage or Death
                Certificate ({PRICE_FROM}) or CENOMAR (₱{PRICE_CENOMAR}) for you
                — all-in, delivered straight to your door anywhere in the
                Philippines.
              </p>
              <div className="mt-7">
                <Cta id="hero-cta" className="w-full sm:w-auto">
                  Order via Messenger — from {PRICE_FROM}
                </Cta>
                <p className="mt-2.5 flex items-center gap-1.5 text-[13px] text-white/60">
                  <Clock className="h-3.5 w-3.5" />
                  Usually replies within minutes
                </p>
              </div>
            </div>

            {/* Rendered once, not once per breakpoint: two copies of the same
                SVG mean two <defs> sharing one gradient id, and the duplicate
                won — the envelope came out with no fill at all. The grid
                already stacks it under the CTA on a phone, which is the order
                we want anyway: button first, picture after. */}
            <div className="mt-2 md:mt-0">
              <HeroArt />
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 2. Social proof strip ---------- */}
      <div className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-4 text-center text-[13px] font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[#eda100]" aria-hidden>
              ★★★★★
            </span>
            {PROOF_STATS.ratingLabel}
          </span>
          <span className="hidden text-slate-300 sm:inline">·</span>
          <span className="inline-flex items-center gap-1.5">
            <PackageCheck className="h-4 w-4 text-[#6DBE45]" />
            {PROOF_STATS.deliveredLabel}
          </span>
          <span className="hidden text-slate-300 sm:inline">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-[#1E86C7]" />
            {PROOF_STATS.shippingLabel}
          </span>
        </div>
      </div>

      {/* ---------- 3. Pain ---------- */}
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-[24px] font-bold leading-snug tracking-tight text-[#14406F] md:text-3xl">
            Kilala mo &apos;to: half-day leave, pumila ka pa, tapos &ldquo;balik
            ka na lang bukas.&rdquo;
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-slate-600">
            Getting a PSA certificate means filing a leave, commuting, falling
            in line for hours — and sometimes going home empty-handed. If
            you&apos;re an OFW or working abroad? Mas mahirap pa. DocuAssist PH
            exists so you never have to do that again.
          </p>
        </div>
      </Section>

      {/* ---------- 4. How it works ---------- */}
      <Section className="bg-slate-50">
        <h2 className="text-center text-[24px] font-bold tracking-tight text-[#14406F] md:text-3xl">
          Three steps. Zero pila.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            {
              icon: MessageSquare,
              title: "Message us",
              body: "Tap the button, tell us which document you need. We'll send you a short form.",
            },
            {
              icon: ReceiptText,
              title: "Pay & relax",
              body: `Settle payment via GCash or bank transfer (${PRICE_FROM}, or ₱${PRICE_CENOMAR} for CENOMAR — all-in), then we handle everything with PSA. Processing takes 1–2 weeks.`,
            },
            {
              icon: Truck,
              title: "Receive it at your door",
              body: "We ship your document anywhere in the Philippines (about 1 week). Track every step with your personal tracking link — no app, no account needed.",
            },
          ].map((s, i) => (
            <div
              key={s.title}
              className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <span className="absolute -top-3.5 left-6 flex h-8 w-8 items-center justify-center rounded-full bg-[#14406F] text-sm font-bold text-white">
                {i + 1}
              </span>
              <s.icon className="mt-2 h-7 w-7 text-[#1E86C7]" />
              <h3 className="mt-3 text-[17px] font-bold text-slate-900">
                {s.title}
              </h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------- 5. Pricing ---------- */}
      <Section id="pricing">
        <h2 className="text-center text-[24px] font-bold tracking-tight text-[#14406F] md:text-3xl">
          All-in pricing — walang hidden fees
        </h2>

        <div className="mx-auto mt-9 max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(16,24,40,0.08)]">
          <div className="divide-y divide-slate-100">
            <PriceRow
              price={PRICE_STANDARD}
              label="PSA Birth Certificate, Marriage Certificate, or Death Certificate"
            />
            <PriceRow
              price={PRICE_CENOMAR}
              label="CENOMAR (Certificate of No Marriage Record)"
            />
          </div>

          <ul className="space-y-2.5 border-t border-slate-100 bg-slate-50/70 px-6 py-6">
            {[
              "PSA processing & handling fees included",
              "Nationwide door-to-door delivery",
              "Personal tracking link + SMS updates",
              "Real human assistance on Messenger",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[15px] text-slate-700">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#6DBE45]" />
                {f}
              </li>
            ))}
          </ul>

          <div className="px-6 py-6 text-center">
            <Cta className="w-full">Start My Order</Cta>
            <p className="mt-4 text-[13px] leading-relaxed text-slate-500">
              TIN ID and PhilHealth ID assistance also available — chat us for
              details.
            </p>
          </div>
        </div>

        {/* Said plainly and up front. Someone who finds this out only after
            committing feels tricked; someone who reads it here decides. */}
        <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-[#1E86C7]/25 bg-[#1E86C7]/[0.06] p-5">
          <p className="flex items-start gap-2.5 text-[14px] leading-relaxed text-slate-700">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1E86C7]" />
            <span>
              <strong className="font-semibold text-[#14406F]">
                Payment is settled before processing
              </strong>{" "}
              — that&apos;s how we keep pricing flat and start your request the
              same day. You&apos;ll receive a confirmation receipt and your
              tracking link right after.
            </span>
          </p>
        </div>
      </Section>

      {/* ---------- 6. Proof gallery ---------- */}
      <Section className="bg-slate-50">
        <h2 className="text-center text-[24px] font-bold tracking-tight text-[#14406F] md:text-3xl">
          Totoong deliveries, totoong customers.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-[15px] leading-relaxed text-slate-600">
          Every parcel here is a real DocuAssist PH order — delivered, received,
          at masaya ang customer.
        </p>
        <div className="mt-9">
          <ProofGallery />
        </div>
      </Section>

      {/* ---------- 7. FAQ ---------- */}
      <Section>
        <h2 className="text-center text-[24px] font-bold tracking-tight text-[#14406F] md:text-3xl">
          Mga tanong na sure kaming itatanong mo.
        </h2>
        <div className="mx-auto mt-9 max-w-2xl">
          <Faq />
        </div>
      </Section>

      {/* ---------- 8. Final CTA ---------- */}
      <div className="bg-gradient-to-b from-[#14406F] to-[#0F3A66] px-4 py-16 text-center text-white md:py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-[26px] font-extrabold tracking-tight md:text-4xl">
            Handa na? &apos;Wag mo nang i-file yung leave.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-white/80">
            Order now — {PRICE_FROM} all-in (₱{PRICE_CENOMAR} for CENOMAR),
            processed for you, delivered to your door, tracked every step of the
            way.
          </p>
          <div className="mt-8">
            <Cta className="w-full sm:w-auto">
              Order via Messenger — from {PRICE_FROM}
            </Cta>
          </div>
        </div>
      </div>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-slate-200 bg-white px-4 py-10">
        <div className="mx-auto max-w-5xl space-y-3 text-center text-[13px] leading-relaxed text-slate-500">
          <p className="font-semibold text-slate-700">
            DocuAssist PH © {new Date().getFullYear()}
          </p>
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#1E86C7] hover:underline"
            >
              Facebook page
            </a>
            <span className="text-slate-300">·</span>
            <a href="/track" className="font-medium text-[#1E86C7] hover:underline">
              Track your order
            </a>
          </p>
          <p>
            Online document processing assistance service. Processing and
            delivery timelines are estimates.
          </p>
          <p className="mx-auto max-w-xl">
            Privacy: we collect only the details needed to process your
            documents, and we don&apos;t share them with anyone outside that
            purpose.
          </p>
          {/* Staff used to land on the dashboard from this URL; the landing
              page took it, so the way in is named rather than lost. */}
          <p className="pt-2">
            <a href="/login" className="text-slate-400 hover:text-slate-600 hover:underline">
              Staff login
            </a>
          </p>
        </div>
      </footer>

      {/* Bottom bar on phones once the hero button has scrolled away. */}
      <StickyCta />
      {/* Clears the sticky bar so the footer's last line is never hidden. */}
      <div className="h-20 md:hidden" aria-hidden />
    </main>
  );
}

function PriceRow({ price, label }: { price: number; label: string }) {
  return (
    <div className="flex items-center gap-5 px-6 py-6">
      <div className="shrink-0">
        <div className="text-[32px] font-extrabold leading-none tracking-tight text-[#14406F]">
          ₱{price}
        </div>
        <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-[#6DBE45]">
          All-in
        </div>
      </div>
      <p className="text-[15px] leading-snug text-slate-700">{label}</p>
    </div>
  );
}

/**
 * The hero picture: an envelope and a phone showing the real tracking page.
 *
 * Drawn inline rather than shipped as a photo — it is a few hundred bytes, it
 * scales without a second asset, and it shows the one thing that separates
 * this from a chat-only seller: the customer can watch their own document move.
 */
function HeroArt() {
  return (
    <svg
      viewBox="0 0 400 300"
      className="h-auto w-full max-w-md md:ml-auto"
      role="img"
      aria-label="A PSA document envelope and a phone showing the order tracking page"
    >
      <defs>
        <linearGradient id="env" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#DCE7F3" />
        </linearGradient>
      </defs>

      {/* Envelope */}
      <g transform="translate(18 74)">
        <rect x="0" y="0" width="212" height="148" rx="12" fill="url(#env)" />
        <path d="M0 14 L106 88 L212 14" fill="none" stroke="#9FB8D4" strokeWidth="6" strokeLinecap="round" />
        <rect x="22" y="104" width="104" height="9" rx="4.5" fill="#C3D4E6" />
        <rect x="22" y="121" width="68" height="9" rx="4.5" fill="#D7E2EF" />
        {/* Stamp */}
        <rect x="158" y="102" width="34" height="34" rx="6" fill="#6DBE45" opacity="0.85" />
        <path d="M166 119 l6 6 l12 -13" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Phone showing the tracking page */}
      <g transform="translate(236 26)">
        <rect x="0" y="0" width="142" height="252" rx="22" fill="#0B2B4C" />
        <rect x="8" y="8" width="126" height="236" rx="16" fill="#FFFFFF" />
        <rect x="52" y="15" width="38" height="6" rx="3" fill="#0B2B4C" opacity="0.25" />

        {/* Status pill */}
        <rect x="22" y="34" width="98" height="26" rx="13" fill="#1E86C7" opacity="0.12" />
        <rect x="32" y="43" width="62" height="8" rx="4" fill="#1E86C7" />

        {/* Stepper */}
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(26 ${78 + i * 36})`}>
            <circle cx="9" cy="9" r="9" fill={i < 2 ? "#6DBE45" : "#E2E8F0"} />
            {i < 2 && (
              <path d="M5 9 l3 3 l6 -7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            )}
            {i < 3 && <rect x="7.5" y="20" width="3" height="14" rx="1.5" fill={i < 1 ? "#6DBE45" : "#E2E8F0"} />}
            <rect x="28" y="4" width={i === 1 ? 62 : 48} height="7" rx="3.5" fill={i <= 1 ? "#334155" : "#CBD5E1"} />
          </g>
        ))}

        {/* Delivery date chip */}
        <rect x="22" y="212" width="98" height="20" rx="10" fill="#6DBE45" opacity="0.15" />
        <rect x="32" y="219" width="56" height="6" rx="3" fill="#3F8F2B" />
      </g>
    </svg>
  );
}
