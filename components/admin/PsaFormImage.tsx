"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check, Download, AlertCircle, Loader2 } from "lucide-react";
import { PsaForm } from "@/components/print/PsaForm";
import {
  copyPngToClipboard,
  downloadPng,
  formImageFilename,
  nodeToPng,
} from "@/lib/form-image";

type Job = "copy" | "download";

/**
 * Copy the filled PSA form as an image without leaving the order.
 *
 * Staff send the form to the customer on Messenger to confirm their details
 * before anything is filed at the PSA. That was a trip to the print page and
 * back for every order, so the same two buttons live here.
 *
 * The form is only built when a button is pressed. It is a large piece of
 * markup and an order can hold several documents — rendering them all on
 * every visit would cost every staff member time they never asked to spend.
 */
export function PsaFormImage({
  serviceCode,
  serviceName,
  details,
  label,
}: {
  serviceCode: string;
  serviceName: string;
  /** The values on screen, so an unsaved correction is in the picture too. */
  details: Record<string, string>;
  /** Customer and document, for the downloaded file's name. */
  label: string;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const hasDetails = Object.values(details).some((v) => String(v ?? "").trim());

  // The capture waits for the form to exist, which is why it runs here rather
  // than in the click: React has to paint the offscreen copy first.
  useEffect(() => {
    if (!job) return;
    let cancelled = false;

    (async () => {
      try {
        // Two frames, then the webfonts — a snapshot taken before the boxes
        // have their real font comes out with the letters out of the grid.
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r))
        );
        if (document.fonts?.ready) await document.fonts.ready;
        if (cancelled) return;

        const node = formRef.current;
        if (!node) throw new Error("The form could not be built.");
        const blob = await nodeToPng(node);
        if (cancelled) return;

        if (job === "copy") {
          await copyPngToClipboard(blob);
          if (cancelled) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } else {
          downloadPng(blob, formImageFilename(label));
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not make the image — try Download instead."
          );
        }
      } finally {
        if (!cancelled) setJob(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [job, label]);

  function start(next: Job) {
    setError(null);
    setJob(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => start("copy")}
          disabled={job !== null || !hasDetails}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied — paste
              in Messenger
            </>
          ) : job === "copy" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering…
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy form image
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => start("download")}
          disabled={job !== null || !hasDetails}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {job === "download" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering…
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" /> Download
            </>
          )}
        </button>

        <span className="text-xs text-muted-foreground">
          {hasDetails
            ? "the filled PSA form, as a picture"
            : "fill the PSA form fields first"}
        </span>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {/* Built only while a button is working, and parked off-screen: it has to
          be laid out for real to be photographed, but it is not for looking at
          here. aria-hidden keeps it out of the screen reader's way. */}
      {job !== null && (
        <div
          aria-hidden
          className="pointer-events-none fixed left-[-10000px] top-0"
        >
          <div ref={formRef} className="w-fit bg-white">
            <PsaForm
              serviceCode={serviceCode}
              serviceName={serviceName}
              details={details}
            />
          </div>
        </div>
      )}
    </div>
  );
}
