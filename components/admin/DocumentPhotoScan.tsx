"use client";

import { useRef, useState } from "react";
import { Camera, X, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseDocumentImage } from "@/lib/actions/parse";
import { MAX_IMAGES } from "@/lib/parse/vision-limits";
import type { ParseResult } from "@/lib/actions/parse";

interface Shot {
  /** Object URL for the thumbnail. */
  preview: string;
  data: string;
  mediaType: "image/jpeg";
}

/**
 * Anthropic bills an image by its pixel area, and detail beyond ~1568px on the
 * long edge buys nothing. A 12MP phone photo downscaled here costs a fraction
 * of the original and uploads in a second on a Philippine mobile connection.
 */
const MAX_EDGE = 1568;

async function downscale(file: File): Promise<Shot> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    throw new Error(
      `"${file.name}" isn't an image this browser can read. A JPG or PNG screenshot works.`
    );
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process the image.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return {
    preview: dataUrl,
    data: dataUrl.slice(dataUrl.indexOf(",") + 1),
    mediaType: "image/jpeg",
  };
}

/**
 * Read a document from a photo of it.
 *
 * Plenty of customers send the certificate itself and nothing else. Typing it
 * out is the slowest part of intake and the place typos come from, so the
 * photo is read instead — then handed to staff to check, exactly like a parsed
 * paste. The image itself is never stored.
 */
export function DocumentPhotoScan({
  serviceId,
  orderId,
  onParsed,
  disabled,
}: {
  serviceId: string;
  orderId?: string | null;
  onParsed: (r: ParseResult) => void;
  disabled?: boolean;
}) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function add(files: FileList | File[] | null) {
    if (!files) return;
    setError(null);
    const room = MAX_IMAGES - shots.length;
    if (room <= 0) {
      setError(`${MAX_IMAGES} photos is the most it can read at once.`);
      return;
    }
    try {
      const next: Shot[] = [];
      for (const f of Array.from(files).slice(0, room)) {
        if (!f.type.startsWith("image/")) {
          throw new Error(`"${f.name}" isn't an image.`);
        }
        next.push(await downscale(f));
      }
      setShots((prev) => [...prev, ...next]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be read.");
    }
  }

  async function scan() {
    if (shots.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const res = await parseDocumentImage(
        shots.map((s) => ({ data: s.data, mediaType: s.mediaType })),
        serviceId,
        orderId ?? null
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onParsed(res.value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="space-y-2"
      onPaste={(e) => {
        // Staff copy the photo straight out of Messenger, so a paste has to
        // work as well as picking a file.
        const files = Array.from(e.clipboardData?.files ?? []);
        if (files.length) {
          e.preventDefault();
          void add(files);
        }
      }}
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          <Camera className="h-4 w-4" />
          {shots.length === 0 ? "Attach a photo of the document" : "Add another"}
        </Button>
        {shots.length > 0 && (
          <Button
            type="button"
            size="sm"
            className="bg-[#eda100] font-semibold text-[#3d2f00] shadow-sm hover:bg-[#d99400]"
            disabled={disabled || busy}
            onClick={scan}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Reading the photo…
              </>
            ) : (
              <>
                <Camera className="h-4 w-4" /> Read {shots.length} photo
                {shots.length === 1 ? "" : "s"} and fill the form
              </>
            )}
          </Button>
        )}
      </div>

      {shots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {shots.map((s, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.preview}
                alt={`Document photo ${i + 1}`}
                className="h-20 w-20 rounded-md border object-cover"
              />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => setShots((p) => p.filter((_, n) => n !== i))}
                className="absolute -right-1.5 -top-1.5 rounded-full border bg-white p-0.5 text-slate-500 shadow-sm hover:text-red-700"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        For customers who send the certificate instead of filling anything in.
        Check every box afterwards — a photo can be misread, and the photo
        itself is not saved.
      </p>

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
