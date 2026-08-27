import QRCode from "qrcode";

/** Generate a PNG data URL QR code for the given text (server-side). */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

/** Absolute public tracking URL for a code, from NEXT_PUBLIC_SITE_URL. */
export function trackingUrl(code: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return `${base}/track/${code}`;
}
