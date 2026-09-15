import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Clock,
  FileCheck2,
  MessageSquare,
  QrCode,
  Radar,
  ReceiptText,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { getLandingBranding } from "@/lib/landing-data";
import { BrandLogo } from "@/components/track/BrandLogo";
import { ProofGallery } from "@/components/landing/ProofGallery";
import { Faq } from "@/components/landing/Faq";
import { StickyCta } from "@/components/landing/Cta";
import {
  ORDER_URL,
  MESSENGER_URL,
  FACEBOOK_URL,
  PRICE_STANDARD,
  PRICE_CENOMAR,
  PRICE_ID,
  PRICE_FROM,
  PROOF_STATS,
} from "@/lib/landing";

/* Regenerated every few minutes rather than rendered per request: the page is
   otherwise static and Lighthouse likes it that way, but the logo comes from
   settings and should appear without waiting for a deploy. */
export const revalidate = 300;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://docuassist.vercel.app";

const DESC = `Order your PSA Birth Certificate, Marriage or Death Certificate (${PRICE_FROM}) or CENOMAR (₱${PRICE_CENOMAR}) online. All-in pricing, processed for you, delivered nationwide. No lines. No leave filed.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: `DocuAssist PH — PSA Certificates Delivered to Your Door | from ${PRICE_FROM}`,
  description: DESC,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "DocuAssist PH",
    title: `PSA Certificates Delivered to Your Door — from ${PRICE_FROM}`,
    description: DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: `PSA Certificates Delivered to Your Door — from ${PRICE_FROM}`,
    description:
      "All-in pricing, processed for you, delivered nationwide. No lines. No leave filed.",
  },
};

/** The one button on the page, in two weights. */
function Cta({
  children,
  id,
  variant = "solid",
  className = "",
}: {
  children: React.ReactNode;
  id?: string;
  variant?: "solid" | "ghost";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-[15px] font-semibold transition active:scale-[0.99]";
  const look =
    variant === "solid"
      ? "bg-[#14406F] text-white shadow-lg shadow-[#14406F]/20 hover:bg-[#0F3A66]"
      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <a id={id} href={ORDER_URL} className={`${base} ${look} ${className}`}>
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
    <section id={id} className={`px-4 py-16 md:py-24 ${className}`}>
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </section>
  );
}

function Heading({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-[27px] font-extrabold leading-tight tracking-tight text-[#0F2E4F] md:text-[38px]">
        {children}
      </h2>
      {sub && (
        <p className="mt-4 text-[16px] leading-relaxed text-slate-500">{sub}</p>
      )}
    </div>
  );
}

export default async function LandingPage() {
  // The header paints with the real logo, read through the public RPC so this
  // page never needs a service-role key.
  const business = await getLandingBranding();

  return (
    <main className="bg-white text-slate-800 antialiased">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          {/* A logo stands on its own in a nav. The uploaded one already sets
              "docuassist ph" under the mark, and even a mark-only logo reads
              fine unaccompanied here — printing the name beside it risked
              saying it twice depending on a setting, so it simply doesn't. */}
          <a href="/" className="flex shrink-0 items-center gap-2.5">
            {business.logo_url ? (
              <BrandLogo
                src={business.logo_url}
                name={business.business_name}
                lockup={business.logo_includes_name}
                bare
              />
            ) : (
              <span className="text-[16px] font-extrabold tracking-tight text-[#0F2E4F]">
                {business.business_name}
              </span>
            )}
          </a>
          <div className="ml-auto hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
            <a href="#how" className="hover:text-[#14406F]">How it works</a>
            <a href="#pricing" className="hover:text-[#14406F]">Pricing</a>
            <a href="#faq" className="hover:text-[#14406F]">FAQ</a>
            <a href="/track" className="hover:text-[#14406F]">Track order</a>
          </div>
          <a
            href={ORDER_URL}
            className="ml-auto shrink-0 rounded-lg bg-[#14406F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F3A66] sm:ml-0"
          >
            Order now
          </a>
        </nav>
      </header>

      {/* ---------- 1. Hero ---------- */}
      <div className="bg-gradient-to-b from-[#F4F9F5] via-[#F7FBF8] to-white">
        <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-12 md:pb-24 md:pt-20">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600 shadow-sm">
                🇵🇭 Serving customers nationwide · Legit PSA documents
              </p>
              <h1 className="mt-6 text-[34px] font-extrabold leading-[1.1] tracking-tight text-[#0F2E4F] md:text-[52px]">
                Get your PSA certificate without falling in line.
              </h1>
              <p className="mt-5 text-[16px] leading-relaxed text-slate-500 md:text-[17px]">
                We process your PSA Birth Certificate, Marriage or Death
                Certificate ({PRICE_FROM}) or CENOMAR (₱{PRICE_CENOMAR}) for you
                — all-in, delivered straight to your door anywhere in the
                Philippines.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Cta id="hero-cta">
                  Start my order <ArrowRight className="h-4 w-4" />
                </Cta>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  See how it works
                </a>
              </div>

              <div className="mt-7 flex items-center gap-3">
                <Avatars />
                <div className="text-[13px] leading-tight">
                  <p className="font-semibold text-slate-800">
                    <span className="text-[#eda100]">★★★★★</span>{" "}
                    {PROOF_STATS.rating} Rating
                  </p>
                  <p className="text-slate-500">
                    {PROOF_STATS.deliveredLabel}
                  </p>
                </div>
              </div>
            </div>

            {/* Rendered once, not once per breakpoint: two copies of the same
                SVG mean two <defs> sharing one gradient id, and the duplicate
                wins — the envelope came out with no fill at all. */}
            <div>
              <HeroArt />
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 2. Trust strip ---------- */}
      <div className="border-y border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-5 text-center text-[13px] font-medium text-slate-500">
          <span className="inline-flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-[#6DBE45]" />
            {PROOF_STATS.ratingLabel}
          </span>
          <span className="inline-flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-[#1E86C7]" />
            {PROOF_STATS.deliveredLabel}
          </span>
          <span className="inline-flex items-center gap-2">
            <Truck className="h-4 w-4 text-[#1E86C7]" />
            {PROOF_STATS.shippingLabel}
          </span>
          <span className="inline-flex items-center gap-2">
            <QrCode className="h-4 w-4 text-[#6DBE45]" />
            GCash &amp; bank transfer
          </span>
        </div>
      </div>

      {/* ---------- 3. Pain ---------- */}
      <Section>
        <Heading sub="Getting a PSA certificate means filing a leave, commuting, falling in line for hours — and sometimes going home empty-handed. If you're an OFW or working abroad? Mas mahirap pa. DocuAssist PH exists so you never have to do that again.">
          Kilala mo &apos;to: half-day leave, pumila ka pa, tapos &ldquo;balik ka
          na lang bukas.&rdquo;
        </Heading>
      </Section>

      {/* ---------- 4. Feature grid ---------- */}
      <Section className="bg-[#F8FAF9]">
        <Heading>Everything handled, walang pila.</Heading>
        <div className="mt-12 grid grid-cols-1 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-2 sm:divide-y-0 md:grid-cols-3">
          {[
            { icon: ReceiptText, title: "All-in pricing", body: "One flat price covers the PSA fee, handling and nationwide delivery. Walang dagdag pagdating." },
            { icon: Radar, title: "Personal tracking link", body: "Watch your document move through every stage — no account, no app, no asking." },
            { icon: Truck, title: "Nationwide delivery", body: "Luzon, Visayas, Mindanao — kahit probinsya. Door to door." },
            { icon: FileCheck2, title: "Checked before filing", body: "We read your details back to you before anything is filed, so a typo never becomes a wrong certificate." },
            { icon: QrCode, title: "GCash or bank", body: "Scan a QR at checkout and you're done. Receipt and tracking link agad." },
            { icon: MessageSquare, title: "Real humans", body: "Message us any time and an actual person replies — usually within minutes." },
          ].map((f, i) => (
            <div
              key={f.title}
              className={`p-7 sm:border-b sm:border-slate-200 ${
                i % 3 !== 2 ? "md:border-r md:border-slate-200" : ""
              } ${i % 2 === 0 ? "sm:border-r sm:border-slate-200 md:border-r" : ""}`}
            >
              <f.icon className="h-6 w-6 text-[#6DBE45]" />
              <h3 className="mt-4 text-[16px] font-bold text-[#0F2E4F]">
                {f.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------- 5. How it works ---------- */}
      <Section id="how">
        <Heading sub="Pick your document, fill in the details, check them once, pay. That's it.">
          Four steps. Zero pila.
        </Heading>
        <div className="mt-12 grid gap-5 md:grid-cols-4">
          {[
            { icon: FileCheck2, title: "Choose your document", body: "Tap Start my order and pick what you need — PSA certificate, CENOMAR, TIN or PhilHealth ID." },
            { icon: MessageSquare, title: "Fill in the details", body: "A short form, only the fields the PSA actually asks for." },
            { icon: ShieldCheck, title: "Check & pay", body: `We show your answers back to you before anything is filed. Confirm, then scan the QR to pay (${PRICE_FROM}, ₱${PRICE_CENOMAR} CENOMAR, ₱${PRICE_ID} IDs).` },
            { icon: Truck, title: "Track it to your door", body: "Your tracking link appears right after payment — save it. Processing 1–2 weeks, shipping about 1 week." },
          ].map((s, i) => (
            <div
              key={s.title}
              className="relative rounded-2xl border border-slate-200 bg-white p-6"
            >
              <span className="absolute -top-3.5 left-6 flex h-8 w-8 items-center justify-center rounded-full bg-[#14406F] text-sm font-bold text-white">
                {i + 1}
              </span>
              <s.icon className="mt-2 h-6 w-6 text-[#1E86C7]" />
              <h3 className="mt-3 text-[16px] font-bold text-[#0F2E4F]">
                {s.title}
              </h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------- 6. Pricing ---------- */}
      <Section id="pricing" className="bg-[#F8FAF9]">
        <Heading>All-in pricing — walang hidden fees</Heading>

        <div className="mx-auto mt-12 max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(16,24,40,0.06)]">
          <div className="divide-y divide-slate-100">
            <PriceRow price={PRICE_STANDARD} label="PSA Birth Certificate, Marriage Certificate, or Death Certificate" />
            <PriceRow price={PRICE_CENOMAR} label="CENOMAR (Certificate of No Marriage Record)" />
            <PriceRow price={PRICE_ID} label="TIN ID or PhilHealth ID assistance" />
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
            <Cta className="w-full">
              Start My Order <ArrowRight className="h-4 w-4" />
            </Cta>
          </div>
        </div>

        {/* Said plainly and up front. Someone who finds this out only after
            committing feels tricked; someone who reads it here decides. */}
        <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-[#1E86C7]/25 bg-[#1E86C7]/[0.06] p-5">
          <p className="flex items-start gap-2.5 text-[14px] leading-relaxed text-slate-700">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1E86C7]" />
            <span>
              <strong className="font-semibold text-[#0F2E4F]">
                Payment is settled before processing
              </strong>{" "}
              — that&apos;s how we keep pricing flat and start your request the
              same day. You&apos;ll receive a confirmation receipt and your
              tracking link right after.
            </span>
          </p>
        </div>
      </Section>

      {/* ---------- 7. Proof gallery ---------- */}
      <Section>
        <Heading sub="Every parcel here is a real DocuAssist PH order — delivered, received, at masaya ang customer.">
          Totoong deliveries, totoong customers.
        </Heading>
        <div className="mt-12">
          <ProofGallery />
        </div>
      </Section>

      {/* ---------- 8. FAQ ---------- */}
      <Section id="faq" className="bg-[#F8FAF9]">
        <Heading>Mga tanong na sure kaming itatanong mo.</Heading>
        <div className="mx-auto mt-12 max-w-2xl">
          <Faq />
        </div>
      </Section>

      {/* ---------- 9. Final CTA ---------- */}
      <div className="bg-gradient-to-b from-[#14406F] to-[#0F3A66] px-4 py-20 text-center text-white">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-[28px] font-extrabold tracking-tight md:text-[40px]">
            Handa na? &apos;Wag mo nang i-file yung leave.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-white/75">
            Order now — {PRICE_FROM} all-in (₱{PRICE_CENOMAR} for CENOMAR, ₱
            {PRICE_ID} for IDs), processed for you, delivered to your door,
            tracked every step of the way.
          </p>
          <div className="mt-9">
            <a
              href={ORDER_URL}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-7 py-4 text-[16px] font-bold text-[#14406F] shadow-lg transition hover:bg-slate-100 active:scale-[0.99] sm:w-auto"
            >
              Start my order <ArrowRight className="h-4 w-4" />
            </a>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-white/50">
              <Clock className="h-3.5 w-3.5" />
              Takes about 3 minutes
            </p>
          </div>
        </div>
      </div>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-slate-200 bg-white px-4 py-12">
        <div className="mx-auto max-w-5xl space-y-3 text-center text-[13px] leading-relaxed text-slate-500">
          <p className="font-semibold text-slate-700">
            {business.business_name} © {new Date().getFullYear()}
          </p>
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-[#1E86C7] hover:underline">
              Facebook page
            </a>
            <span className="text-slate-300">·</span>
            <a href={MESSENGER_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-[#1E86C7] hover:underline">
              Message us
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

      <StickyCta />
      <div className="h-20 md:hidden" aria-hidden />
    </main>
  );
}

function PriceRow({ price, label }: { price: number; label: string }) {
  return (
    <div className="flex items-center gap-5 px-6 py-6">
      <div className="shrink-0">
        <div className="text-[30px] font-extrabold leading-none tracking-tight text-[#0F2E4F]">
          ₱{price}
        </div>
        <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-[#6DBE45]">
          All-in
        </div>
      </div>
      <p className="text-[15px] leading-snug text-slate-600">{label}</p>
    </div>
  );
}

/**
 * Stand-in faces beside the rating.
 *
 * Deliberately abstract initials rather than stock portraits: a stock photo
 * presented as a customer is exactly the thing this page is trying to prove it
 * is not. Swap for real customer photos only with their permission.
 */
function Avatars() {
  return (
    <div className="flex -space-x-2">
      {["#14406F", "#1E86C7", "#6DBE45"].map((c, i) => (
        <span
          key={c}
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white"
          style={{ background: c }}
          aria-hidden
        >
          {["M", "J", "R"][i]}
        </span>
      ))}
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
          <stop offset="100%" stopColor="#E4EEF7" />
        </linearGradient>
      </defs>

      <g transform="translate(18 74)">
        <rect x="0" y="0" width="212" height="148" rx="12" fill="url(#env)" stroke="#D3E0EC" strokeWidth="2" />
        <path d="M0 14 L106 88 L212 14" fill="none" stroke="#9FB8D4" strokeWidth="6" strokeLinecap="round" />
        <rect x="22" y="104" width="104" height="9" rx="4.5" fill="#C3D4E6" />
        <rect x="22" y="121" width="68" height="9" rx="4.5" fill="#DCE7F1" />
        <rect x="158" y="102" width="34" height="34" rx="6" fill="#6DBE45" opacity="0.9" />
        <path d="M166 119 l6 6 l12 -13" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <g transform="translate(236 26)">
        <rect x="0" y="0" width="142" height="252" rx="22" fill="#0F2E4F" />
        <rect x="8" y="8" width="126" height="236" rx="16" fill="#FFFFFF" />
        <rect x="52" y="15" width="38" height="6" rx="3" fill="#0F2E4F" opacity="0.25" />
        <rect x="22" y="34" width="98" height="26" rx="13" fill="#1E86C7" opacity="0.12" />
        <rect x="32" y="43" width="62" height="8" rx="4" fill="#1E86C7" />
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
        <rect x="22" y="212" width="98" height="20" rx="10" fill="#6DBE45" opacity="0.15" />
        <rect x="32" y="219" width="56" height="6" rx="3" fill="#3F8F2B" />
      </g>
    </svg>
  );
}
