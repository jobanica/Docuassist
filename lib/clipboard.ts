/**
 * Copy text, including where the async clipboard is not available.
 *
 * The supplier works from a phone, often inside an in-app browser, and some of
 * those still have no navigator.clipboard — a copy button that silently does
 * nothing there is worse than no button, because the whole point is that
 * nobody has to re-type a name.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* not permitted here — fall through to the older way */
  }
  try {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.top = "0";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    box.setSelectionRange(0, box.value.length); // iOS needs the explicit range
    const ok = document.execCommand("copy");
    document.body.removeChild(box);
    return ok;
  } catch {
    return false;
  }
}
