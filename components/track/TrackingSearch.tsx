"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Search,
  Phone,
  User,
  FileText,
  PackageX,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  Link2,
  Loader2,
} from "lucide-react";
import { searchOrders } from "@/app/track/actions";
import type { TrackSearchResult } from "@/lib/tracking";
import { statusPillClasses } from "@/lib/publicCopy";
import { fmtDate } from "@/lib/dates";

const OWNER_MARK =
  "box-decoration-clone rounded bg-[#eda100]/25 px-1 py-0.5 font-semibold text-slate-900";

/**
 * The centralized search: phone in, a list of the customer's orders out.
 *
 * A client component so the phone number is posted to the server action rather
 * than put in the URL, and so results replace the form in place without a full
 * navigation. Each result links to that order's own tracking page.
 */
export function TrackingSearch() {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<TrackSearchResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setResult(await searchOrders(phone, name));
    });
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(16,24,40,0.08)]">
        <div className="border-b border-slate-100 px-5 py-4">
          <h1 className="text-base font-bold text-slate-900">
            Track your order
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Enter the mobile number you gave us when you ordered.
          </p>
        </div>

        <form onSubmit={submit} className="px-5 py-5">
          <label
            htmlFor="track-phone"
            className="block text-sm font-semibold text-slate-700"
          >
            Mobile number
          </label>
          <div className="relative mt-1.5">
            <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="track-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0917 123 4567"
              autoComplete="tel"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-[15px] text-slate-900 transition placeholder:text-slate-400 focus:border-[#2a78d6] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2a78d6]/12"
            />
          </div>

          <label
            htmlFor="track-name"
            className="mt-4 block text-sm font-semibold text-slate-700"
          >
            Your name{" "}
            <span className="font-normal text-slate-400">— optional</span>
          </label>
          <div className="relative mt-1.5">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="track-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Only if you have many orders"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-[15px] text-slate-900 transition placeholder:text-slate-400 focus:border-[#2a78d6] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2a78d6]/12"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1e3a5f] py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#16304f] active:scale-[0.99] disabled:opacity-60"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </>
            ) : (
              <>
                <Search className="h-4 w-4" /> Find my order
              </>
            )}
          </button>
        </form>
      </section>

      {result && <Results result={result} phone={phone} />}

      {/* The instructions. Kept below the form once there are results, because
          by then the customer has worked it out and the answer matters more. */}
      {!result && <Instructions />}
    </div>
  );
}

/**
 * How to use the page, said plainly.
 *
 * Most customers arrive here from a Messenger reply and have never seen it
 * before. Three numbered steps and the one rule that actually trips people up
 * — it must be the number they ordered with — prevent most of the "hindi po
 * lumalabas" messages that would otherwise come back to the inbox.
 */
function Instructions() {
  const steps = [
    {
      title: "Enter your mobile number",
      body: "Use the same number you gave our staff when you ordered — that's how we find your documents.",
    },
    {
      title: "Tap “Find my order”",
      body: "All the orders under that number will appear, with the status of each one.",
    },
    {
      title: "Tap an order for full details",
      body: "You'll see the exact stage, the estimated delivery date, and the courier tracking number once it ships.",
    },
  ];

  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(16,24,40,0.08)]">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">
        How to track
      </h2>

      <ol className="mt-4 space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1e3a5f] text-xs font-bold text-white">
              {i + 1}
            </span>
            <div className="pt-0.5">
              <p className="text-sm font-semibold text-slate-900">{s.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">
                {s.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-slate-500">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2a78d6]" />
          <span>
            <span className="font-semibold text-slate-700">
              Have a tracking link from us?
            </span>{" "}
            You can open that link directly instead — it goes straight to that
            one order.
          </span>
        </p>
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            We search by phone number, never by name alone, so nobody else can
            look up your documents.
          </span>
        </p>
      </div>
    </section>
  );
}

function Results({
  result,
  phone,
}: {
  result: TrackSearchResult;
  phone: string;
}) {
  if (result.kind === "rate_limited") {
    return (
      <Notice tone="amber" title="Sandali lang po 🙏">
        Too many searches right now. Please wait a minute and try again.
      </Notice>
    );
  }

  if (result.kind === "need_phone") {
    return (
      <Notice tone="amber" title="Enter your full mobile number">
        We look up orders by the phone number you gave when you booked — for
        example 0917 123 4567.
      </Notice>
    );
  }

  if (result.data.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-6 text-center shadow-[0_4px_20px_rgba(16,24,40,0.08)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <PackageX className="h-7 w-7 text-slate-400" />
        </div>
        <p className="mt-3 font-bold text-slate-900">No orders found</p>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
          We couldn&apos;t find an order under{" "}
          <span className="font-semibold text-slate-700">{phone}</span>. Please
          check the number, or try the other number you may have used. Message
          our page and we&apos;ll help you po.
        </p>
      </section>
    );
  }

  const first = result.data[0].first_name;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-sm text-slate-600">
          {first ? (
            <>
              Hi <span className="font-bold text-slate-900">{first}</span>!
            </>
          ) : (
            "Found"
          )}{" "}
          <span className="font-semibold">{result.data.length}</span> order
          {result.data.length === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-slate-400">Tap for details</p>
      </div>

      {result.data.map((o) => (
        <Link
          key={o.tracking_code}
          href={`/track/${o.tracking_code}`}
          className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(16,24,40,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(16,24,40,0.12)]"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ${statusPillClasses(
                  o.status
                )}`}
              >
                {o.status_label}
              </span>
              {o.is_delayed && !o.is_terminal && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                  <AlertTriangle className="h-3 w-3" /> Delay
                </span>
              )}
            </div>

            <ul className="mt-2.5 space-y-1">
              {o.documents.map((d, n) => (
                <li
                  key={n}
                  className="flex items-start gap-1.5 text-sm leading-snug text-slate-700"
                >
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                  <span>
                    <span className="font-semibold text-slate-900">
                      {d.service_name}
                    </span>
                    {d.quantity > 1 && ` ×${d.quantity}`}
                    {d.owner_name && (
                      <>
                        {" for "}
                        <span className={OWNER_MARK}>{d.owner_name}</span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-2 text-[11px] text-slate-400">
              {!o.is_terminal && o.expected_delivery_date && (
                <>
                  Est. delivery{" "}
                  <span className="font-medium text-slate-500">
                    {fmtDate(o.expected_delivery_date)}
                  </span>{" "}
                  ·{" "}
                </>
              )}
              <span className="font-mono">{o.tracking_code}</span>
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
        </Link>
      ))}
    </div>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "amber";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border p-5 shadow-sm ${
        tone === "amber" ? "border-amber-200 bg-amber-50" : ""
      }`}
    >
      <p className="font-bold text-amber-900">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-amber-800">{children}</p>
    </section>
  );
}
