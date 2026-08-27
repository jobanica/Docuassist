"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

/**
 * Shipped-stage courier block (§7). Courier tracking pages don't accept the
 * number in a URL, so the flow is two-step: copy the number, then open the
 * courier's general tracking page and paste it there.
 */
export function CourierTracking({
  courierName,
  trackingNumber,
  trackingPageUrl,
}: {
  courierName: string;
  trackingNumber: string | null;
  trackingPageUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!trackingNumber) return;
    try {
      await navigator.clipboard.writeText(trackingNumber);
    } catch {
      // Fallback for browsers/contexts without the async clipboard API.
      const el = document.createElement("textarea");
      el.value = trackingNumber;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand("copy");
      } catch {
        return;
      } finally {
        document.body.removeChild(el);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">Courier</p>
      <p className="font-semibold text-slate-900">{courierName}</p>

      {trackingNumber && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-400">Tracking number</p>
              <p className="truncate font-mono text-sm font-medium text-slate-900">
                {trackingNumber}
              </p>
            </div>
            <button
              type="button"
              onClick={copy}
              aria-live="polite"
              className={`flex h-[52px] shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors ${
                copied
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-900 text-white active:bg-slate-700"
              }`}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy
                </>
              )}
            </button>
          </div>

          {trackingPageUrl && (
            <a
              href={trackingPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white active:bg-blue-700"
            >
              <ExternalLink className="h-4 w-4" /> Track Delivery
            </a>
          )}

          <p className="mt-2 text-xs text-slate-500">
            Copy your tracking number, then paste it on the courier&apos;s page.
            I-copy po ang number, tapos i-paste sa page ng courier.
          </p>
        </>
      )}
    </section>
  );
}
