"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Check, Download, AlertCircle, Loader2 } from "lucide-react";
import {
  copyPngToClipboard,
  downloadPng,
  formImageFilename,
  nodeToPng,
} from "@/lib/form-image";

type Job = "copy" | "download";

/**
 * Copy / download an off-screen node as a PNG.
 *
 * The capture is fiddly — the node has to be laid out for real and its fonts
 * loaded before the snapshot, or the letters come out of their boxes — so it
 * lives in one place. The PSA form and the ID confirmation slip both hand it
 * their own markup through `children`; nothing about the picture-making
 * differs between them, and this keeps it that way.
 */
export function CaptureButtons({
  children,
  filenameLabel,
  ready,
  copyLabel = "Copy image",
  readyHint,
  emptyHint,
}: {
  /** The node to photograph, rendered only while a button is working. */
  children: ReactNode;
  /** Customer + document, for the downloaded file's name. */
  filenameLabel: string;
  /** False greys the buttons out — nothing to picture yet. */
  ready: boolean;
  copyLabel?: string;
  readyHint: string;
  emptyHint: string;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

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

        const node = nodeRef.current;
        if (!node) throw new Error("The image could not be built.");
        const blob = await nodeToPng(node);
        if (cancelled) return;

        if (job === "copy") {
          await copyPngToClipboard(blob);
          if (cancelled) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } else {
          downloadPng(blob, formImageFilename(filenameLabel));
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
  }, [job, filenameLabel]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setJob("copy");
          }}
          disabled={job !== null || !ready}
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
              <Copy className="h-3.5 w-3.5" /> {copyLabel}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setJob("download");
          }}
          disabled={job !== null || !ready}
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
          {ready ? readyHint : emptyHint}
        </span>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {/* Built only while a button is working, and parked off-screen: it has to
          be laid out for real to be photographed, but is not for looking at. */}
      {job !== null && (
        <div
          aria-hidden
          className="pointer-events-none fixed left-[-10000px] top-0"
        >
          <div ref={nodeRef} className="w-fit bg-white">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
