/**
 * "Is this a new account, or one you already have?"
 *
 * TIN and PhilHealth both start with that question, because an existing
 * account cannot be applied for twice — the supplier needs the number instead.
 * When the customer does not know it, someone has to look it up at the agency,
 * and that lookup is what the extra fee pays for.
 *
 * The answer is kept on the document rather than the order: an order can carry
 * a TIN and a PhilHealth at once, and they are separate accounts with separate
 * answers.
 */
export const ACCOUNT_TYPE_KEY = "account_type";

export const ACCOUNT_NEW = "new";
export const ACCOUNT_EXISTING_KNOWN = "existing_known";
export const ACCOUNT_EXISTING_UNKNOWN = "existing_unknown";

/** Which services ask the question. Both of the ID products, neither PSA one. */
export const ID_SERVICES = ["tin_id", "philhealth_id"];

/** The field holding the account number, per service. */
export const ID_NUMBER_KEY: Record<string, string> = {
  tin_id: "tin_number",
  philhealth_id: "philhealth_number",
};

/** True when the agency has to be asked for the number, which costs extra. */
export function needsVerification(
  details: Record<string, string> | null | undefined
): boolean {
  return (details?.[ACCOUNT_TYPE_KEY] ?? "").trim() === ACCOUNT_EXISTING_UNKNOWN;
}

/** How many of an order's documents need that lookup — one fee each. */
export function verificationCount(
  items: { form_details?: Record<string, string> | null }[]
): number {
  return items.filter((i) => needsVerification(i.form_details)).length;
}

/**
 * An existing account whose number was left blank.
 *
 * Not a required-field rule, because the field genuinely is optional on a new
 * application — it only becomes required once the customer says they have the
 * account and know the number.
 */
export function missingIdNumber(
  serviceCode: string,
  details: Record<string, string> | null | undefined
): boolean {
  if (!ID_SERVICES.includes(serviceCode)) return false;
  if ((details?.[ACCOUNT_TYPE_KEY] ?? "").trim() !== ACCOUNT_EXISTING_KNOWN) {
    return false;
  }
  const key = ID_NUMBER_KEY[serviceCode];
  return !String(details?.[key] ?? "").trim();
}
