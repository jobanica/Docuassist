import type { FormFieldDef } from "@/lib/types";
import {
  labelScore,
  MATCH_THRESHOLD,
  normalizeLabel,
  splitLabelValue,
} from "./labels";

export interface ParseOptions {
  /** Keys that only match while inside a delivery block. */
  deliveryOnly?: Set<string>;
  /** Keys that never match inside a delivery block. */
  documentOnly?: Set<string>;
}

export interface ParseOutcome {
  /** field key -> extracted value (only fields we actually filled) */
  values: Record<string, string>;
  /** keys that were filled by the parser (for highlighting in the form) */
  filledKeys: string[];
  /** required keys still empty after this tier */
  missingRequired: string[];
}

/** Normalize common PH date spellings to YYYY-MM-DD for <input type="date">. */
export function normalizeDate(raw: string): string {
  const v = raw.trim();
  if (!v) return "";

  // Already ISO
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  // Month name forms: "January 5, 1990" / "5 Jan 1990" / "Jan. 5 1990"
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const named = v
    .toLowerCase()
    .match(/([a-z]{3,9})\.?\s+(\d{1,2})\s*,?\s+(\d{4})/);
  if (named && months[named[1].slice(0, 3)]) {
    return `${named[3]}-${months[named[1].slice(0, 3)]}-${named[2].padStart(2, "0")}`;
  }
  const namedRev = v
    .toLowerCase()
    .match(/(\d{1,2})\s+([a-z]{3,9})\.?\s*,?\s+(\d{4})/);
  if (namedRev && months[namedRev[2].slice(0, 3)]) {
    return `${namedRev[3]}-${months[namedRev[2].slice(0, 3)]}-${namedRev[1].padStart(2, "0")}`;
  }

  // Numeric M/D/YYYY (PH convention follows US ordering on most forms)
  const num = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (num) {
    const a = Number(num[1]);
    const b = Number(num[2]);
    // If the first number can't be a month, treat it as D/M/YYYY.
    const [month, day] = a > 12 ? [b, a] : [a, b];
    return `${num[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return ""; // unrecognized — leave blank so staff notices
}

function coerce(field: FormFieldDef, raw: string): string {
  const value = raw.replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (field.type === "date") return normalizeDate(value);
  if (field.type === "number") {
    const n = value.match(/\d+/);
    return n ? n[0] : "";
  }
  return value;
}

/**
 * Section headings customers put above a block of repeated labels.
 *
 * Their form template reads:
 *     APILYEDO: Nasari          <- the applicant
 *     FIRST NAME: Evin Khan
 *     NAME OF FATHER
 *     APILYEDO: Tan             <- the father, same labels again
 *     FIRST NAME: Pedro
 *
 * Without tracking which block a line belongs to, every "FIRST NAME" maps to
 * the applicant and the last one wins — the parents' details land in the
 * applicant's boxes and the parents' boxes stay empty.
 */
const SECTIONS: { test: RegExp; prefix: string }[] = [
  // Delivery first: "delivery address" must not be read as an owner block.
  { test: /\b(delivery|shipping|padala|ipadala|padalhan|ship to|deliver to|address for delivery|complete address)\b/, prefix: "delivery" },
  { test: /\b(father|ama|tatay|papa|daddy)\b/, prefix: "father_" },
  { test: /\b(mother|ina|nanay|mama|mommy|maiden)\b/, prefix: "mother_" },
  // Anything that puts us back on the person the document is for.
  { test: /\b(owner|applicant|document owner|child|bata|sarili|personal information|requester)\b/, prefix: "" },
];

/** Owner name keys and their per-parent equivalents. */
const NAME_PART: Record<string, string> = {
  last_name: "last",
  first_name: "first",
  middle_name: "middle",
};

function sectionFor(line: string): string | null {
  const n = normalizeLabel(line);
  if (!n) return null;
  for (const s of SECTIONS) if (s.test.test(n)) return s.prefix;
  return null;
}

/** Re-point an owner name field at whichever person the current block is about. */
function scoped(key: string, prefix: string, has: Set<string>): string {
  if (!prefix || prefix === "delivery") return key;
  const part = NAME_PART[key];
  if (!part) return key;
  const scopedKey = prefix + part;
  return has.has(scopedKey) ? scopedKey : key;
}

/**
 * Tier 1 — deterministic, free, instant (§9).
 *
 * Splits the pasted reply into "Label: value" lines and maps each label to a
 * form field by fuzzy matching against the field's label and its configured
 * Taglish synonyms. Three shapes customers actually send are handled:
 *
 *   - `Label: value` on one line.
 *   - A bare label line with its value on the next line ("PLACE OF BIRTH"
 *     then "Mampang Zamboanga City").
 *   - Repeated labels under a person heading (see SECTIONS above).
 *
 * First value wins. In these templates the applicant's block comes first, so
 * an overwrite is nearly always a later block bleeding into an earlier one.
 */
export function parseTier1(
  text: string,
  fields: FormFieldDef[],
  opts: ParseOptions = {}
): ParseOutcome {
  const values: Record<string, string> = {};
  const has = new Set(fields.map((f) => f.key));
  const deliveryOnly = opts.deliveryOnly ?? new Set<string>();
  const documentOnly = opts.documentOnly ?? new Set<string>();
  const lines = text.split(/\r?\n/);

  let section = "";
  let lastKey: string | null = null;
  /** A label seen on its own line, waiting for the value on a later line. */
  let pendingKey: string | null = null;

  const put = (key: string, field: FormFieldDef, raw: string) => {
    const coerced = coerce(field, raw);
    if (coerced && !values[key]) values[key] = coerced;
  };

  const bestField = (label: string): { field: FormFieldDef; score: number } | null => {
    let field: FormFieldDef | null = null;
    let best = 0;
    const inDelivery = section === "delivery";
    for (const f of fields) {
      // "City" means the birthplace under a birth block and the address under
      // a delivery block. Only one set of fields is in play at a time.
      if (inDelivery && documentOnly.has(f.key)) continue;
      if (!inDelivery && deliveryOnly.has(f.key)) continue;
      const score = Math.max(
        labelScore(label, f.label),
        ...(f.synonyms ?? []).map((syn) => labelScore(label, syn))
      );
      if (score > best) {
        best = score;
        field = f;
      }
    }
    return field && best >= MATCH_THRESHOLD ? { field, score: best } : null;
  };

  for (const line of lines) {
    if (!line.trim()) {
      lastKey = null;
      continue;
    }

    const split = splitLabelValue(line);

    // --- "Label: value" on one line ---
    if (split && split.value) {
      const hit = bestField(split.label);
      if (hit) {
        const key = scoped(hit.field.key, section, has);
        put(key, hit.field, split.value);
        pendingKey = null;
        lastKey =
          hit.field.type === "text" || hit.field.type === "textarea" ? key : null;
        continue;
      }
    }

    // A label with nothing after it ("PLACE OF BIRTH:") reads like a heading.
    const bare = split && !split.value ? split.label : split ? null : line;
    if (bare !== null) {
      // A person heading switches which block we are in. Checked before the
      // label match, because "NAME OF FATHER" is both.
      const sec = sectionFor(bare);
      if (sec !== null) {
        section = sec;
        // "NAME OF FATHER" followed by a bare "Pedro Reyes Cruz" — take that
        // line as the whole name, which expandNameGroups then splits.
        // A bare line right under a person heading is that person's whole
        // name; under a delivery heading it is the address.
        const firstKey =
          section === "delivery"
            ? "delivery_address_line"
            : section
              ? `${section}first`
              : "first_name";
        pendingKey = has.has(firstKey) ? firstKey : null;
        lastKey = null;
        continue;
      }

      const hit = bestField(bare);

      // A plain line under a label still waiting for its value. A value can
      // look like a label by accident — "Mampang Zamboanga City" contains
      // "city" — so only an exact label match outranks the waiting field.
      if (pendingKey && !values[pendingKey] && !(hit && hit.score >= 100)) {
        const key = pendingKey;
        // Parent name fields share the owner field's type, so fall back to it.
        const target =
          fields.find((x) => x.key === key) ??
          fields.find((x) => x.key === key.replace(/^(father|mother)_/, ""));
        if (target) {
          put(key, target, line.trim());
          lastKey =
            target.type === "text" || target.type === "textarea" ? key : null;
          pendingKey = null;
          continue;
        }
      }

      if (hit) {
        pendingKey = scoped(hit.field.key, section, has);
        lastKey = null;
        continue;
      }

      // Otherwise it is a wrapped continuation of the previous text field.
      if (lastKey && values[lastKey]) {
        values[lastKey] = `${values[lastKey]} ${line.trim()}`.replace(/\s+/g, " ");
      }
    }
  }

  const filledKeys = Object.keys(values);
  const missingRequired = fields
    .filter((f) => f.required && !values[f.key])
    .map((f) => f.key);

  return { values, filledKeys, missingRequired };
}

/**
 * Surname particles that belong with the following word: "Dela Cruz",
 * "De los Santos", "Del Rosario". Splitting on the last token alone would
 * put "Dela" in the middle-name box and print a mangled surname.
 */
const SURNAME_PARTICLES = new Set([
  "de", "dela", "del", "dels", "los", "las", "la", "delos", "delas",
  "san", "sta", "santa", "sto", "santo", "vda", "ng", "y",
]);

export interface SplitName {
  first: string;
  middle: string;
  last: string;
}

/**
 * Split "Juan Miguel Dela Cruz" into First / Middle / Last.
 *
 * Customers send one line ("Pangalan ng ina: Maria Clara Santos") but the PSA
 * form has three separate boxes, so the whole string would otherwise land in
 * First Name and print wrong. Read as First … Middle Last, the convention the
 * form itself assumes; staff still see every filled box highlighted for review,
 * which is the check for the cases this can't get right.
 */
export function splitFullName(value: string): SplitName {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return { first: value.trim(), middle: "", last: "" };
  }

  const clean = (t: string) => t.toLowerCase().replace(/[^a-z]/g, "");
  let i = tokens.length - 1;
  while (i > 1 && SURNAME_PARTICLES.has(clean(tokens[i - 1]))) i--;

  const last = tokens.slice(i).join(" ");
  const rest = tokens.slice(0, i);
  if (rest.length === 1) return { first: rest[0], middle: "", last };
  return {
    first: rest.slice(0, -1).join(" "),
    middle: rest[rest.length - 1],
    last,
  };
}

/**
 * Where a parsed value is one whole name but the form wants three boxes,
 * spread it across them. Only fills boxes that are still empty, and only when
 * the value actually looks like more than one word.
 */
export function expandNameGroups(
  values: Record<string, string>,
  fields: FormFieldDef[]
): string[] {
  const has = new Set(fields.map((f) => f.key));
  const groups: [first: string, middle: string, last: string][] = [
    ["first_name", "middle_name", "last_name"],
    ["father_first", "father_middle", "father_last"],
    ["mother_first", "mother_middle", "mother_last"],
  ];

  const added: string[] = [];
  for (const [fk, mk, lk] of groups) {
    if (!has.has(fk) || !has.has(lk)) continue;
    const whole = values[fk];
    if (!whole || !whole.trim().includes(" ")) continue;
    // Only when the other boxes are still empty — never overwrite a value the
    // customer or staff gave separately.
    if (values[lk]?.trim() || values[mk]?.trim()) continue;

    const parts = splitFullName(whole);
    if (!parts.last) continue;
    values[fk] = parts.first;
    values[lk] = parts.last;
    added.push(lk);
    if (parts.middle && has.has(mk)) {
      values[mk] = parts.middle;
      added.push(mk);
    }
  }
  return added;
}
