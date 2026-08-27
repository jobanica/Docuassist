"use client";

import { useState } from "react";
import { Copy, Check, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TrackingPanel({
  publicUrl,
  qrDataUrl,
  code,
}: {
  publicUrl: string;
  qrDataUrl: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

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
    </div>
  );
}
