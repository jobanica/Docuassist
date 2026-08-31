import type { FormFieldDef } from "./types";

/**
 * Which of a document's required fields are still empty.
 *
 * A birth certificate without a birthdate is not an order, it is a note to
 * self — the PSA counter cannot act on it and neither can the supplier. The
 * form marks these with an asterisk; this is the check that makes the asterisk
 * mean something.
 *
 * Returns the field LABELS, because the message is read by whoever is looking
 * at the form and "Date of Birth" is what they see on it.
 */
export function missingRequiredLabels(
  fields: FormFieldDef[],
  details: Record<string, string> | null | undefined
): string[] {
  const d = details ?? {};
  return (fields ?? [])
    .filter((f) => f.required && !String(d[f.key] ?? "").trim())
    .map((f) => f.label);
}

/** "Date of Birth", "Date of Birth and Sex", "A, B and C" — for one sentence. */
export function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The message shown when an order is stopped for missing details.
 *
 * It names the document as well as the fields: an order can carry several, and
 * "Date of Birth is missing" is no help when two of them ask for one.
 */
export function missingFieldsMessage(
  perDocument: { serviceName: string; labels: string[] }[]
): string {
  const parts = perDocument
    .filter((d) => d.labels.length > 0)
    .map((d) => `${d.serviceName}: ${joinLabels(d.labels)}`);
  if (parts.length === 0) return "";
  return (
    `Required details are still blank — ${parts.join("; ")}. ` +
    `Fill them in, or save this as a new inquiry until the customer sends them.`
  );
}
