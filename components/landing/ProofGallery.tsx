"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, X, Quote, ChevronLeft, ChevronRight } from "lucide-react";
import {
  PROOF_ITEMS,
  PROOF_QUOTES,
  PROOF_SCREENSHOTS,
  type ProofItem,
} from "@/lib/landing";

/**
 * Real deliveries, shown rather than claimed.
 *
 * Nothing heavier than a poster image loads until it is asked for: images are
 * lazy, and a video downloads no bytes at all (preload="none", no <source>
 * mounted) until someone taps it. A gallery is the easiest place on a landing
 * page to lose the Lighthouse score, and this one sits below the fold where it
 * would otherwise drag first paint down with it.
 *
 * Mobile is a snap carousel with the next card peeking, so it reads as
 * swipeable without a visible scrollbar; desktop is a three-column grid.
 */
export function ProofGallery() {
  const [lightbox, setLightbox] = useState<number | null>(null);

  const close = useCallback(() => setLightbox(null), []);
  const move = useCallback(
    (d: number) =>
      setLightbox((i) =>
        i === null ? null : (i + d + PROOF_ITEMS.length) % PROOF_ITEMS.length
      ),
    []
  );

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    document.addEventListener("keydown", onKey);
    // Stop the page scrolling behind the overlay.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [lightbox, close, move]);

  return (
    <>
      <div
        className="
          -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
          md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0 md:pb-0
        "
      >
        {PROOF_ITEMS.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setLightbox(i)}
            className="
              group w-[78%] shrink-0 snap-start overflow-hidden rounded-2xl border
              border-slate-200 bg-white text-left shadow-sm transition
              hover:-translate-y-0.5 hover:shadow-md md:w-auto
            "
          >
            <Thumb item={item} />
            <p className="px-3.5 py-3 text-[13px] font-medium leading-snug text-slate-600">
              {item.caption}
            </p>
          </button>
        ))}

      </div>

      <p className="mt-1 text-center text-xs text-slate-400 md:hidden">
        Swipe to see more →
      </p>

      <ScreenshotWall />

      <QuoteWall />

      {lightbox !== null && (
        <Lightbox
          item={PROOF_ITEMS[lightbox]}
          onClose={close}
          onPrev={() => move(-1)}
          onNext={() => move(1)}
        />
      )}
    </>
  );
}

/**
 * The screenshots, whole.
 *
 * Shown at their own aspect ratio rather than cropped to a tile: a phone
 * screenshot and a desktop inbox are nothing like the same shape, and the
 * thing that makes a screenshot convincing is that it plainly has not been
 * tidied up. Cropping it to a neat square is the one edit that makes it look
 * staged.
 *
 * Masonry columns, so a tall thread and a wide inbox sit side by side without
 * either leaving a hole. Tapping one opens it full size — on a phone the text
 * in a desktop screenshot is unreadable otherwise.
 */
function ScreenshotWall() {
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    if (zoom === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
      if (e.key === "ArrowRight")
        setZoom((i) => (i === null ? null : (i + 1) % PROOF_SCREENSHOTS.length));
      if (e.key === "ArrowLeft")
        setZoom((i) =>
          i === null
            ? null
            : (i - 1 + PROOF_SCREENSHOTS.length) % PROOF_SCREENSHOTS.length
        );
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [zoom]);

  if (PROOF_SCREENSHOTS.length === 0) return null;

  return (
    <div className="mt-12">
      <h3 className="text-center text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
        Screenshots, hindi na in-edit
      </h3>
      <div className="mt-6 gap-4 [column-fill:_balance] sm:columns-2 lg:columns-3">
        {PROOF_SCREENSHOTS.map((shot, i) => (
          <figure key={shot.src} className="mb-4 break-inside-avoid">
            <button
              type="button"
              onClick={() => setZoom(i)}
              className="block w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.src}
                alt={shot.alt}
                loading="lazy"
                decoding="async"
                className="block h-auto w-full"
              />
            </button>
            {shot.caption && (
              <figcaption className="mt-1.5 px-1 text-[12px] leading-snug text-slate-500">
                {shot.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {zoom !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={PROOF_SCREENSHOTS[zoom].alt}
          onClick={() => setZoom(null)}
        >
          <button
            type="button"
            onClick={() => setZoom(null)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={PROOF_SCREENSHOTS[zoom].src}
            alt={PROOF_SCREENSHOTS[zoom].alt}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full rounded-lg"
          />
        </div>
      )}
    </div>
  );
}

/**
 * The messages, as messages.
 *
 * Kept out of the video carousel on purpose. Fourteen of these swiped one at a
 * time is a chore; read as a wall they do the thing a wall of thanks does —
 * nobody counts them, they just register that there are a lot. Masonry columns
 * because the lines are wildly different lengths and a grid would leave each
 * short one sitting in a tall empty box.
 */
function QuoteWall() {
  if (PROOF_QUOTES.length === 0) return null;
  return (
    <div className="mt-12">
      <h3 className="text-center text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
        Diretso sa aming inbox
      </h3>
      <div className="mt-6 gap-4 [column-fill:_balance] sm:columns-2 lg:columns-3">
        {PROOF_QUOTES.map((q, i) => (
          <figure
            key={i}
            className="mb-4 break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_10px_rgba(16,24,40,0.05)]"
          >
            <Quote className="h-4 w-4 text-[#6DBE45]" aria-hidden />
            <blockquote className="mt-2 text-[15px] leading-relaxed text-slate-700">
              {q.quote}
            </blockquote>
            <figcaption className="mt-3 flex items-center gap-1.5 text-[12px] text-slate-400">
              <span className="font-semibold text-slate-600">{q.name}</span>
              <span aria-hidden>·</span>
              <span>
                {q.source === "facebook"
                  ? "Facebook comment"
                  : "Messenger"}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      {/* Said plainly, because the alternative reading is that we wrote them. */}
      <p className="mt-6 text-center text-xs text-slate-400">
        Totoong mensahe mula sa aming customers. Surnames shortened to an
        initial — privacy po nila.
      </p>
    </div>
  );
}

/** Square so mixed phone photos still line up; object-cover does the rest. */
function Thumb({ item }: { item: ProofItem }) {
  const poster = item.type === "video" ? item.poster : item.src;
  return (
    <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster}
        alt={item.alt}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      {item.type === "video" && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-lg">
            <Play className="ml-0.5 h-6 w-6 fill-[#14406F] text-[#14406F]" />
          </span>
        </span>
      )}
    </div>
  );
}

function Lightbox({
  item,
  onClose,
  onPrev,
  onNext,
}: {
  item: ProofItem;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={item.caption}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-6 w-6" />
      </button>

      <NavBtn side="left" onClick={onPrev} />
      <NavBtn side="right" onClick={onNext} />

      <figure
        className="max-h-full w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {item.type === "video" && item.src ? (
          // Muted so it can start on tap without being blocked, controls on so
          // the viewer can unmute — never sound they did not ask for.
          <video
            ref={videoRef}
            src={item.src}
            poster={item.poster}
            controls
            playsInline
            muted
            autoPlay
            preload="none"
            className="max-h-[75vh] w-full rounded-xl bg-black"
          />
        ) : item.type === "video" ? (
          <div className="rounded-xl bg-slate-800 p-10 text-center text-sm text-white/70">
            Video coming soon — drop an mp4 into /public/proof/ and set its{" "}
            <code>src</code> in lib/landing.ts.
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.src}
            alt={item.alt}
            className="max-h-[75vh] w-full rounded-xl object-contain"
          />
        )}
        <figcaption className="mt-3 text-center text-sm text-white/80">
          {item.caption}
          {/* A testimonial is what the customer says, and a browser will not
              let it start out loud. Without this line it plays as a silent
              clip of someone talking, and the point of it is lost. */}
          {item.type === "video" && item.src && (
            <span className="mt-1 block text-xs text-white/50">
              I-tap po ang 🔊 para sa boses — starts muted
            </span>
          )}
        </figcaption>
      </figure>
    </div>
  );
}

function NavBtn({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Previous" : "Next"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 ${
        side === "left" ? "left-2" : "right-2"
      }`}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}
