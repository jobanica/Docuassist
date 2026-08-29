import type { FormFieldDef } from "@/lib/types";
import { labelScore, MATCH_THRESHOLD, splitLabelValue } from "./labels";

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
 * Tier 1 — deterministic, free, instant (§9). Splits the pasted reply into
 * "Label: value" lines and maps each label to a form field via fuzzy matching
 * against the field's label and its configured Taglish synonyms.
 *
 * Multi-line values are supported: a line with no separator is appended to the
 * previous field's value (customers often wrap addresses across lines).
 */
export function parseTier1(
  text: string,
  fields: FormFieldDef[]
): ParseOutcome {
  const values: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  let lastKey: string | null = null;

  for (const line of lines) {
    if (!line.trim()) {
      lastKey = null;
      continue;
    }

    const split = splitLabelValue(line);
    if (split) {
      // Score every field (label + synonyms) and take the best — labels
      // overlap, so first-match-wins would mis-assign "Pangalan ng ina".
      let field: FormFieldDef | null = null;
      let best = 0;
      for (const f of fields) {
        const score = Math.max(
          labelScore(split.label, f.label),
          ...(f.synonyms ?? []).map((syn) => labelScore(split.label, syn))
        );
        if (score > best) {
          best = score;
          field = f;
        }
      }
      if (field && best >= MATCH_THRESHOLD) {
        const coerced = coerce(field, split.value);
        if (coerced) values[field.key] = coerced;
        // Track even when empty so a wrapped value can still attach.
        lastKey = field.type === "text" || field.type === "textarea"
          ? field.key
          : null;
        continue;
      }
    }

    // Continuation of the previous text field (wrapped address, etc.)
    if (lastKey && !split && values[lastKey]) {
      values[lastKey] = `${values[lastKey]} ${line.trim()}`.replace(/\s+/g, " ");
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
