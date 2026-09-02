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
  MessageCircle,
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
export function TrackingSearch({
  messengerUrl,
}: {
  messengerUrl: string | null;
}) {
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
      <form
        onSubmit={submit}
        className="rounded-2xl bg-white p-5 shadow-sm"
      >
        <label className="block text-sm font-medium text-slate-700">
          Your phone number
        </label>
        <div className="relative mt-1.5">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0917 123 4567"
            autoComplete="tel"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <label className="mt-3 block text-sm font-medium text-slate-700">
          Your name <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <div className="relative mt-1.5">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Helps if you have many orders"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Search className="h-4 w-4" />
          {pending ? "Searching…" : "Find my order"}
        </button>

        <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          We match by phone number so no one else can look up your documents by
          name.
        </p>
      </form>

      {result && (
        <Results result={result} messengerUrl={messengerUrl} phone={phone} />
      )}
    </div>
  );
}

function Results({
  result,
  messengerUrl,
  phone,
}: {
  result: TrackSearchResult;
  messengerUrl: string | null;
  phone: string;
}) {
  if (result.kind === "rate_limited") {
    return (
      <Card>
        <p className="font-semibold text-slate-900">Sandali lang po 🙏</p>
        <p className="mt-1 text-sm text-slate-500">
          Too many searches right now. Please wait a minute and try again.
        </p>
      </Card>
    );
  }

  if (result.kind === "need_phone") {
    return (
      <Card>
        <p className="font-semibold text-slate-900">
          Enter your full phone number
        </p>
        <p className="mt-1 text-sm text-slate-500">
          We look up orders by the phone number you gave when you booked.
        </p>
      </Card>
    );
  }

  if (result.data.length === 0) {
    return (
      <Card center>
        <PackageX className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 font-semibold text-slate-900">No orders found</p>
        <p className="mt-1 text-sm text-slate-500">
          We couldn&apos;t find an order under{" "}
          <span className="font-medium text-slate-700">{phone}</span>. Check the
          number, or message our page and we&apos;ll help you po.
        </p>
        {messengerUrl && (
          <a
            href={messengerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <MessageCircle className="h-4 w-4" />
            Message us on Facebook
          </a>
        )}
      </Card>
    );
  }

  const first = result.data[0].first_name;
  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-slate-600">
        {first ? (
          <>
            Hi <span className="font-semibold">{first}</span>! Found{" "}
          </>
        ) : (
          "Found "
        )}
        <span className="font-semibold">{result.data.length}</span> order
        {result.data.length === 1 ? "" : "s"}. Tap one to see the full details.
      </p>

      {result.data.map((o) => (
        <Link
          key={o.tracking_code}
          href={`/track/${o.tracking_code}`}
          className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${statusPillClasses(
                  o.status
                )}`}
              >
                {o.status_label}
              </span>
              {o.is_delayed && !o.is_terminal && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="h-3 w-3" /> Delay
                </span>
              )}
            </div>

            <ul className="mt-2 space-y-1">
              {o.documents.map((d, n) => (
                <li
                  key={n}
                  className="flex items-start gap-1.5 text-sm text-slate-700"
                >
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span>
                    <span className="font-medium text-slate-900">
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

            <p className="mt-1.5 text-xs text-slate-400">
              {!o.is_terminal && o.expected_delivery_date
                ? `Est. delivery ${fmtDate(o.expected_delivery_date)} · `
                : ""}
              <span className="font-mono">{o.tracking_code}</span>
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
        </Link>
      ))}
    </div>
  );
}

function Card({
  children,
  center,
}: {
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-white p-6 shadow-sm ${center ? "text-center" : ""}`}
    >
      {children}
    </div>
  );
}
