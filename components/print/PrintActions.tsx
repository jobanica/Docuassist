"use client";

import { useState } from "react";
import { Printer, Copy, Check, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toMessage } from "@/lib/action-result";

/**
 * Print / copy-as-image / download-as-image for the filled PSA form.
 *
 * "Copy image" puts a PNG on the clipboard so staff can paste it straight into
 * a Messenger chat for the customer to confirm before we file the request.
 * Clipboard image write needs a secure context and isn't available in every
 * browser, so Download is always offered as the fallback.
 */
export function PrintActions({ targetId }: { targetId: string }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"copy" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toPng(): Promise<Blob> {
    const node = document.getElementById(targetId);
    if (!node) throw new Error("Form not found on the page.");
    // Imported lazily so the library isn't in the initial bundle.
    const { toBlob } = await import("html-to-image");
    const blob = await toBlob(node, {
      pixelRatio: 2, // legible when the customer zooms in on a phone
      backgroundColor: "#ffffff",
      cacheBust: true,
    });
    if (!blob) throw new Error("Could not render the form as an image.");
    return blob;
  }

  async function copyImage() {
    setError(null);
    setBusy("copy");
    try {
      const blob = await toPng();
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
        throw new Error(
          "This browser can't copy images. Use “Download image” and attach the file instead."
        );
      }
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not copy the image — try Download instead."
      );
    } finally {
      setBusy(null);
    }
  }

  async function downloadImage() {
    setError(null);
    setBusy("download");
    try {
      const blob = await toPng();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `psa-form-${targetId}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 print:hidden">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        <Button variant="outline" onClick={copyImage} disabled={busy !== null}>
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Copied — paste in Messenger
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              {busy === "copy" ? "Rendering…" : "Copy image"}
            </>
          )}
        </Button>
        <Button variant="outline" onClick={downloadImage} disabled={busy !== null}>
          <Download className="h-4 w-4" />
          {busy === "download" ? "Rendering…" : "Download image"}
        </Button>
      </div>
      {error && (
        <p className="flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
