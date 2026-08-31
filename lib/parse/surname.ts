/**
 * The Philippine naming rule, checked against what was encoded.
 *
 * A child carries the father's surname as their last name and the mother's
 * maiden surname as their middle name. When the names on a PSA application
 * don't follow that, it is nearly always a transcription slip — the mother's
 * married surname written where her maiden name goes, or the parents' rows
 * filled in the wrong order — and the PSA counter rejects the request.
 *
 * The exception is real and common: a child with no father on record uses the
 * mother's surname as their last name, and carries no middle name. So a blank
 * father is not treated as missing data to nag about; it switches which rule
 * applies.
 *
 * This warns. It never blocks and never rewrites a name: a legally adopted
 * child, a corrected entry, and a name the customer has used their whole life
 * are all things staff know and this file does not.
 */

export interface SurnameIssue {
  /** Field the warning is about, for the UI to point at. */
  field: "last_name" | "middle_name";
  message: string;
  /** What the rule expects, when there is a definite answer. */
  expected?: string;
}

/** Compare the way a counter clerk would: case, accents and spacing aside. */
function norm(v: string | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Templates with a parent block — only these carry the rule. */
export const SURNAME_RULE_SERVICES = ["psa_birth", "cenomar"];

/**
 * Ways staff write "there isn't one" into a box that will not stay empty.
 *
 * A form with a required-looking father field gets "N/A" far more often than
 * it gets left blank, and reading that as a surname turns the single-mother
 * exemption off exactly when it is needed: the rule then insists the child be
 * called N/A. Compared after norm(), which has already folded case, accents
 * and punctuation — so "N/A", "n.a." and "N / A" all arrive as "N A".
 */
const ABSENT = new Set([
  "N A",
  "NA",
  "NONE",
  "NOT APPLICABLE",
  "NOT STATED",
  "NOT KNOWN",
  "UNKNOWN",
  "WALA",
  "WALA PO",
  "DI ALAM",
  "HINDI ALAM",
  "X",
  "XX",
  "XXX",
  "NIL",
  "BLANK",
]);
// Deliberately not here: "DECEASED" and "LATE". A father who has died is still
// the father, and the child still carries his surname — reading those as "no
// father" would swap one wrong warning for another.

/** True when the box is empty or holds one of those stand-ins. */
function absent(normalised: string): boolean {
  return !normalised || ABSENT.has(normalised);
}

export function surnameIssues(
  serviceCode: string,
  details: Record<string, string>
): SurnameIssue[] {
  if (!SURNAME_RULE_SERVICES.includes(serviceCode)) return [];

  const last = norm(details.last_name);
  const middle = norm(details.middle_name);
  const fatherLast = norm(details.father_last);
  const fatherFirst = norm(details.father_first);
  const motherLast = norm(details.mother_last);

  // Nothing to compare against yet — an empty form is not a wrong one.
  if (!last) return [];

  const out: SurnameIssue[] = [];
  // "No father" covers both the blank form and the one where somebody typed
  // N/A. A child with no father on record takes the mother's surname and
  // carries no middle name, and neither is a mistake to warn about.
  const noFather = absent(fatherLast) && absent(fatherFirst);
  // A mother's box holding a stand-in is nothing to compare against either.
  const haveMother = !absent(motherLast);

  if (noFather) {
    // Single mother: the child takes the mother's surname, and the middle name
    // is left out. Both are expected here, so neither is flagged on its own.
    if (haveMother && last !== motherLast) {
      out.push({
        field: "last_name",
        expected: details.mother_last?.trim(),
        message: `No father is recorded, so the child's last name should be the mother's maiden last name (${details.mother_last?.trim()}) — "${details.last_name?.trim()}" doesn't match. If the father just wasn't filled in, add him.`,
      });
    }
    return out;
  }

  if (!absent(fatherLast) && last !== fatherLast) {
    out.push({
      field: "last_name",
      expected: details.father_last?.trim(),
      message: `Last name should be the father's last name (${details.father_last?.trim()}), but "${details.last_name?.trim()}" was encoded.`,
    });
  }

  // A missing middle name is a real gap once a father is on record, since the
  // rule then always produces one.
  if (haveMother && !middle) {
    out.push({
      field: "middle_name",
      expected: details.mother_last?.trim(),
      message: `Middle name is blank — with both parents recorded it should be the mother's maiden last name (${details.mother_last?.trim()}).`,
    });
  } else if (haveMother && middle !== motherLast) {
    out.push({
      field: "middle_name",
      expected: details.mother_last?.trim(),
      message: `Middle name should be the mother's maiden last name (${details.mother_last?.trim()}), but "${details.middle_name?.trim()}" was encoded. Check she wasn't given her married surname.`,
    });
  }

  return out;
}

// -----------------------------------------------------------------------------
// Accepting a warning
// -----------------------------------------------------------------------------
/**
 * Some of these warnings are right about the rule and wrong about the family.
 *
 * The common one in the Philippines: the parents are not married, so the child
 * is registered under the mother's surname even though the father is named on
 * the certificate. The rule cannot tell that from a transcription slip, and the
 * office can — so staff accept the warning and say why, once, instead of
 * meeting it again on every visit to the order and on the board.
 */
export const NAME_CHECK_REASONS = [
  "The parents are not married — the child carries the mother's surname",
  "The child is adopted, or the name was legally changed",
  "This is exactly how the PSA record reads",
  "The customer confirmed the names are right",
];

/**
 * The names an acceptance was given for.
 *
 * Stored alongside the acceptance and compared on every read, so accepting a
 * warning never blesses a name typed later: change any of the five names and
 * the key stops matching, the acceptance stops applying, and the warning comes
 * back. Correct the name back and the old acceptance holds again, which is the
 * right answer for a fat-fingered edit.
 */
export function nameCheckKey(details: Record<string, string>): string {
  return [
    norm(details.last_name),
    norm(details.middle_name),
    norm(details.father_last),
    norm(details.father_first),
    norm(details.mother_last),
  ].join("|");
}

/** Whether a stored acceptance still covers the names as they are now. */
export function nameCheckAccepted(
  details: Record<string, string>,
  ackKey: string | null | undefined
): boolean {
  return Boolean(ackKey) && ackKey === nameCheckKey(details);
}
