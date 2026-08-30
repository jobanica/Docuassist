/**
 * Label normalization + fuzzy matching for the Tier-1 rule-based parser (§9).
 * The business controls the form template it sends customers, so replies are
 * usually "Label: value" lines — but with typos, casing drift, and Taglish
 * variants. These helpers absorb that noise without any API cost.
 */

/** Lowercase, strip accents/punctuation/filler, collapse whitespace. */
export function normalizeLabel(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Taglish filler and politeness particles that show up inside labels
    .replace(/\b(po|ho|ang|ng|na|nang|yung|iyong|mo|niyo|ninyo|ko)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance, capped for short-circuit speed. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr.slice();
  }
  return prev[b.length];
}

/**
 * Score how well a pasted label matches a target label/synonym, 0 = no match.
 *
 * Scoring (not just a boolean) matters because labels overlap: "Pangalan ng
 * ina" must win for Mother's Maiden Name rather than being grabbed by the
 * full-name synonym "pangalan". The caller picks the highest-scoring field.
 */
export function labelScore(candidate: string, target: string): number {
  const a = normalizeLabel(candidate);
  const b = normalizeLabel(target);
  if (!a || !b) return 0;

  // Exact match after normalization — the strongest possible signal.
  if (a === b) return 100;

  const aTokens = a.split(" ").filter(Boolean);
  const bTokens = b.split(" ").filter(Boolean);

  // Every target token present as a whole word in the candidate.
  // More target tokens = more specific = better; extra noise words cost a little.
  if (bTokens.every((t) => aTokens.includes(t))) {
    const extra = aTokens.length - bTokens.length;
    return Math.max(40, 70 + bTokens.length * 5 - extra * 6);
  }

  // Loose substring (handles glued forms like "birthdate" vs "birth date").
  if (b.length >= 5 && a.includes(b)) return 55;
  if (a.length >= 5 && b.includes(a)) return 50;

  // Typo tolerance, scaled to label length. Scored above the threshold but
  // below exact/token matches, so a real match always beats a fuzzy one.
  const tolerance = b.length <= 6 ? 1 : b.length <= 12 ? 2 : 3;
  const d = levenshtein(a, b);
  if (d <= tolerance) return 60 - d * 5;

  return 0;
}

/** Minimum score we accept as a real label match. */
export const MATCH_THRESHOLD = 40;

/** Boolean convenience wrapper around {@link labelScore}. */
export function labelMatches(candidate: string, target: string): boolean {
  return labelScore(candidate, target) >= MATCH_THRESHOLD;
}

/** Split a line into label + value on the first :, -, =, or tab separator. */
export function splitLabelValue(
  line: string
): { label: string; value: string } | null {
  // A colon, equals or tab separates a label from its value unambiguously.
  const strong = line.match(/^\s*([^:=\t]{1,60}?)\s*[:=\t]\s*(.*)$/);
  if (strong && strong[1].trim()) {
    return { label: strong[1].trim(), value: strong[2].trim() };
  }

  // "Philhealth # 12-345678901-2" — a label ending in # with the value after a
  // space. Their forms write it this way, and it has no other reading.
  const hash = line.match(/^\s*([^:=\t]{1,40}?#)\s+(.+)$/);
  if (hash) return { label: hash[1].trim(), value: hash[2].trim() };

  // A hyphen separates only when it is not inside the value: "Barangay -
  // Mabiga" is a label, "12-345678901-2" is a PhilHealth number and splitting
  // it there threw the first group away.
  const dash = line.match(/^\s*([^-]{1,60}?)\s*-\s*(.*)$/);
  if (dash && dash[1].trim() && !/\d\s*$/.test(dash[1])) {
    return { label: dash[1].trim(), value: dash[2].trim() };
  }
  return null;
}
