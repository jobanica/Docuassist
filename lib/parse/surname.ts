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
  const noFather = !fatherLast && !fatherFirst;

  if (noFather) {
    // Single mother: the child takes the mother's surname, and the middle name
    // is left out. Both are expected here, so neither is flagged on its own.
    if (motherLast && last !== motherLast) {
      out.push({
        field: "last_name",
        expected: details.mother_last?.trim(),
        message: `No father is recorded, so the child's last name should be the mother's maiden last name (${details.mother_last?.trim()}) — "${details.last_name?.trim()}" doesn't match. If the father just wasn't filled in, add him.`,
      });
    }
    return out;
  }

  if (fatherLast && last !== fatherLast) {
    out.push({
      field: "last_name",
      expected: details.father_last?.trim(),
      message: `Last name should be the father's last name (${details.father_last?.trim()}), but "${details.last_name?.trim()}" was encoded.`,
    });
  }

  // A missing middle name is a real gap once a father is on record, since the
  // rule then always produces one.
  if (motherLast && !middle) {
    out.push({
      field: "middle_name",
      expected: details.mother_last?.trim(),
      message: `Middle name is blank — with both parents recorded it should be the mother's maiden last name (${details.mother_last?.trim()}).`,
    });
  } else if (motherLast && middle !== motherLast) {
    out.push({
      field: "middle_name",
      expected: details.mother_last?.trim(),
      message: `Middle name should be the mother's maiden last name (${details.mother_last?.trim()}), but "${details.middle_name?.trim()}" was encoded. Check she wasn't given her married surname.`,
    });
  }

  return out;
}
