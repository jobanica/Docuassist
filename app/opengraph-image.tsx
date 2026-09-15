import { ImageResponse } from "next/og";
import { PRICE_STANDARD, PRICE_CENOMAR } from "@/lib/landing";

/**
 * The card Facebook shows when this link is pasted into an ad or a post.
 *
 * Generated rather than shipped as a file so it can never drift from the price
 * in lib/landing.ts — change the constant and the card changes with it. Drawn
 * with plain divs because ImageResponse supports only a subset of CSS.
 */
export const runtime = "edge";
export const alt = "DocuAssist PH — PSA certificates delivered to your door";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Fetch a subset of Noto Sans covering exactly the characters on the card.
 *
 * The renderer's default font has no ₱ (U+20B1), so "₱365" came out as a tofu
 * box — on the first thing a prospect sees in an ad, that reads as broken.
 * Subsetting by `text=` keeps the download to a few KB. Returns null rather
 * than throwing: a font that fails to load must not take the whole card with
 * it, so the caller falls back to "PHP" on plain text.
 */
async function loadFont(text: string, weight: 400 | 800) {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Noto+Sans:wght@${weight}&text=${encodeURIComponent(text)}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    ).then((r) => (r.ok ? r.text() : ""));
    const url = css.match(/src:\s*url\((https:[^)]+)\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image() {
  const eyebrow = "🇵🇭 DocuAssist PH · Document processing services";
  const headline = "PSA certificates delivered to your door.";
  const sub = "No lines. No leave filed. All-in pricing, nationwide delivery.";
  const peso = `₱${PRICE_STANDARD} all-in`;
  const cenomar = `CENOMAR ₱${PRICE_CENOMAR}`;
  const all = eyebrow + headline + sub + peso + cenomar;

  const [bold, regular] = await Promise.all([
    loadFont(all, 800),
    loadFont(all, 400),
  ]);
  const hasFont = Boolean(bold && regular);

  // Without the font there is no ₱ glyph, so say it in letters instead of
  // shipping a box the viewer has to guess at.
  const priceMain = hasFont ? peso : `PHP ${PRICE_STANDARD} all-in`;
  const priceAlt = hasFont ? cenomar : `CENOMAR PHP ${PRICE_CENOMAR}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px",
          background: "linear-gradient(135deg, #0F3A66 0%, #1E6FA8 100%)",
          color: "white",
          fontFamily: hasFont ? "Noto Sans" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, opacity: 0.85 }}>
          {eyebrow}
        </div>

        <div style={{ display: "flex", fontSize: 68, fontWeight: 800, lineHeight: 1.1, marginTop: 26, letterSpacing: -1.5 }}>
          {headline}
        </div>

        <div style={{ display: "flex", fontSize: 31, opacity: 0.82, marginTop: 24, lineHeight: 1.35 }}>
          {sub}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 44 }}>
          <div
            style={{
              display: "flex",
              background: "#6DBE45",
              color: "#0B2B4C",
              fontSize: 34,
              fontWeight: 800,
              padding: "14px 30px",
              borderRadius: 999,
            }}
          >
            {priceMain}
          </div>
          <div
            style={{
              display: "flex",
              border: "3px solid rgba(255,255,255,0.4)",
              fontSize: 30,
              fontWeight: 600,
              padding: "12px 28px",
              borderRadius: 999,
            }}
          >
            {priceAlt}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: hasFont
        ? [
            { name: "Noto Sans", data: bold!, weight: 800 as const, style: "normal" as const },
            { name: "Noto Sans", data: regular!, weight: 400 as const, style: "normal" as const },
          ]
        : undefined,
    }
  );
}
