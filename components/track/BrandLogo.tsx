"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The business logo, with a monogram to fall back on.
 *
 * A logo URL that fails used to render as the browser's broken-image icon at
 * the top of the customer's tracking page — the first thing they see, and the
 * one element that has to look deliberate. The logo currently configured is a
 * Facebook CDN link, and those carry an expiring signature, so this is not a
 * hypothetical.
 *
 * onError alone is not enough: the image is in the server-rendered HTML, so it
 * usually fails BEFORE React hydrates and attaches the handler, and the event
 * is missed — which is why the broken icon survived a naive fix. The effect
 * below re-checks on mount (a complete image with no intrinsic width has
 * failed), catching exactly that case.
 */
export function BrandLogo({
  src,
  name,
  className = "h-14 w-auto",
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setBroken(true);
  }, []);

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "DA";

  if (!src || broken) {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
        {/* The brand's blue-to-green run, so a missing logo still looks like
            this company rather than a grey placeholder. */}
        <span className="bg-gradient-to-br from-[#14406F] via-[#1E86C7] to-[#6DBE45] bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
          {initials}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={name}
      onError={() => setBroken(true)}
      className={`${className} max-h-14 rounded-2xl bg-white object-contain p-1.5 shadow-sm`}
    />
  );
}
