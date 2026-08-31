/**
 * Turning a rendered PSA form into an image staff can send to the customer.
 *
 * Shared by the print page and the order screen so the two cannot drift: the
 * customer should get the same picture whichever button produced it.
 *
 * Browser-only — html-to-image needs a real DOM, so every caller is a client
 * component and the library is imported lazily to keep it out of the first
 * load.
 */

/** Rendered at 2x so the customer can zoom in on a phone and still read it. */
const PIXEL_RATIO = 2;

export async function nodeToPng(node: HTMLElement): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, {
    pixelRatio: PIXEL_RATIO,
    backgroundColor: "#ffffff",
    cacheBust: true,
  });
  if (!blob) throw new Error("Could not render the form as an image.");
  return blob;
}

/**
 * Put a PNG on the clipboard. Image write needs a secure context and is not
 * in every browser, so the message points at the download instead of leaving
 * staff wondering why nothing pasted.
 */
export async function copyPngToClipboard(blob: Blob): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error(
      "This browser can't copy images. Use “Download image” and attach the file instead."
    );
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export function downloadPng(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A filename that says who and what, so a folder of them stays sortable. */
export function formImageFilename(label: string): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "psa-form";
  return `${slug}-${Date.now()}.png`;
}
