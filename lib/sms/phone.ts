/**
 * PH mobile number normalization for Semaphore (§10).
 * Accepts the forms customers actually type: 09171234567, +639171234567,
 * 639171234567, 9171234567, and anything with spaces/dashes/parens.
 * Returns Semaphore's expected 09XXXXXXXXX form, or null if it isn't a
 * plausible PH mobile number.
 */
export function normalizePhPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;

  let local: string;
  if (digits.startsWith("63") && digits.length === 12) {
    local = "0" + digits.slice(2);          // 639171234567
  } else if (digits.startsWith("0") && digits.length === 11) {
    local = digits;                          // 09171234567
  } else if (digits.length === 10 && digits.startsWith("9")) {
    local = "0" + digits;                    // 9171234567
  } else {
    return null;
  }

  // PH mobile numbers are 09 + 9 digits.
  return /^09\d{9}$/.test(local) ? local : null;
}
