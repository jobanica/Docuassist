"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Download, ExternalLink, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/action-result";
import { setOrderMessengerPage } from "@/lib/actions/messenger-pages";
import type { MessengerPage } from "@/lib/types";

export function TrackingPanel({
  publicUrl,
  qrDataUrl,
  code,
  orderId,
  messengerPages,
  messengerPageId,
}: {
  publicUrl: string;
  qrDataUrl: string;
  code: string;
  orderId: string;
  messengerPages: MessengerPage[];
  messengerPageId: string | null;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [pageId, setPageId] = useState(messengerPageId ?? "");
  const [error, setError] = useState<string | null>(null);

  const fallback = messengerPages.find((p) => p.is_default) ?? null;
  const effective = messengerPages.find((p) => p.id === pageId) ?? fallback;

  function changePage(next: string) {
    setPageId(next);
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await setOrderMessengerPage(orderId, next || null));
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt={`QR code for order ${code}`}
          className="h-28 w-28 rounded-md border"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="break-all font-mono text-xs text-muted-foreground">
            {publicUrl}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy link
                </>
              )}
            </Button>
            <a
              href={qrDataUrl}
              download={`docuassist-${code}.png`}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Download QR
            </a>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
            >
              <ExternalLink className="h-4 w-4" /> Open
            </a>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Send this link or QR to the customer via Messenger. It works with no
        login and shows only their first name + status.
      </p>

      {/* Which page the tracking link's "Message us" button opens. Different
          lines of work are answered by different pages. */}
      {messengerPages.length > 1 && (
        <div className="space-y-1.5 border-t pt-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MessageCircle className="h-3.5 w-3.5" />
            Customer messages this page
          </label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={pageId}
            disabled={pending}
            onChange={(e) => changePage(e.target.value)}
          >
            <option value="">
              Business default{fallback ? ` — ${fallback.name}` : ""}
            </option>
            {messengerPages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {effective && (
            <p className="truncate text-[11px] text-muted-foreground">
              {effective.url}
            </p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
