import { CITIES, PROVINCES } from "@/lib/data/psgc";
import { levenshtein } from "./labels";

/**
 * Check a city/municipality and province against the PSA's own PSGC list.
 *
 * Customers get these wrong constantly — a barangay written where the city
 * goes ("Mampang Zamboanga City"), a misspelling, or a city paired with the
 * wrong province. On a PSA form that gets the application rejected; on a
 * delivery address it gets the parcel returned. Both cost real money, and both
 * are cheap to catch here.
 *
 * This never corrects anything on its own. It reports what looks wrong so
 * staff can confirm with the customer, because only the customer knows which
 * San Fernando they meant.
 */

export type PlaceStatus = "ok" | "suggest" | "unknown";

export interface PlaceCheck {
  /** What the customer wrote. */
  input: string;
  status: PlaceStatus;
  /** The official name, when we are confident which one they meant. */
  suggestion?: string;
  /** Set when the city is real but sits in a different province. */
  wrongProvince?: string;
}

export interface PlaceIssue {
  /** Which field this is about, e.g. "Place of Birth — City". */
  label: string;
  input: string;
  kind: "unknown" | "spelling" | "province_mismatch";
  suggestion?: string;
  message: string;
  /** Which pair this belongs to, so the UI knows which fields to touch. */
  group: "birth" | "delivery";
  /** The one-click correction: which field to change, and to what. For a
   *  mismatch the city is right and the province is wrong, so the fix is the
   *  province — not the name that was flagged. */
  fix?: { field: "city" | "province"; value: string };
}

function norm(v: string): string {
  return v
    // "Cotabato ( north)" is Cotabato. Customers and staff add these asides
    // constantly; flagging them as unknown provinces would be noise.
    .replace(/\([^)]*\)/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface CityEntry {
  name: string;
  province: string;
}

const cityByAlias = new Map<string, CityEntry[]>();
/** Every alias, for fuzzy and "contains" matching. A customer writing
 *  "Zamboango City" is closer to the alias than to "City of Zamboanga". */
const cityKeys: { key: string; entry: CityEntry }[] = [];

function addAlias(alias: string, entry: CityEntry) {
  const k = norm(alias);
  if (!k) return;
  const list = cityByAlias.get(k);
  if (list) {
    if (!list.some((e) => e.name === entry.name && e.province === entry.province)) {
      list.push(entry);
    }
  } else {
    cityByAlias.set(k, [entry]);
  }
  cityKeys.push({ key: k, entry });
}

for (const [name, provIdx] of CITIES) {
  const entry: CityEntry = { name, province: PROVINCES[provIdx] };
  addAlias(name, entry);
  // PSGC writes "City of Batac"; customers write "Batac City" or "Batac".
  const cityOf = name.match(/^City of (.+)$/i);
  if (cityOf) {
    addAlias(`${cityOf[1]} City`, entry);
    addAlias(cityOf[1], entry);
  }
  const trailing = name.match(/^(.+) City$/i);
  if (trailing) addAlias(trailing[1], entry);
}

const provinceByAlias = new Map<string, string>();
for (const p of PROVINCES) provinceByAlias.set(norm(p), p);
for (const [alias, canonical] of [
  ["ncr", "Metro Manila"],
  ["national capital region", "Metro Manila"],
  ["manila", "Metro Manila"],
  ["mm", "Metro Manila"],
] as const) {
  provinceByAlias.set(norm(alias), canonical);
}

/** Levenshtein tolerance that scales with the length of the name. */
function tolerance(s: string): number {
  return s.length <= 6 ? 1 : s.length <= 12 ? 2 : 3;
}

function closest(
  input: string,
  candidates: { key: string; value: string }[]
): string | undefined {
  const a = norm(input);
  if (!a) return undefined;
  let best: string | undefined;
  let bestD = Infinity;
  const tol = tolerance(a);
  for (const c of candidates) {
    // Length gap alone rules most candidates out before the expensive part.
    if (Math.abs(c.key.length - a.length) > tol) continue;
    const d = levenshtein(a, c.key);
    if (d <= tol && d < bestD) {
      bestD = d;
      best = c.value;
      if (d === 0) break;
    }
  }
  return best;
}

export function checkProvince(input: string): PlaceCheck {
  const raw = input.trim();
  if (!raw) return { input: raw, status: "ok" };
  const exact = provinceByAlias.get(norm(raw));
  if (exact) {
    return { input: raw, status: "ok", suggestion: exact };
  }
  const near = closest(
    raw,
    PROVINCES.map((p) => ({ key: norm(p), value: p }))
  );
  if (near) return { input: raw, status: "suggest", suggestion: near };
  return { input: raw, status: "unknown" };
}

export function checkCity(input: string, province?: string): PlaceCheck {
  const raw = input.trim();
  if (!raw) return { input: raw, status: "ok" };

  const prov = province?.trim()
    ? provinceByAlias.get(norm(province)) ?? undefined
    : undefined;

  const pick = (list: CityEntry[]): CityEntry => {
    if (prov) {
      const inProv = list.find((e) => e.province === prov);
      if (inProv) return inProv;
    }
    return list[0];
  };

  const exact = cityByAlias.get(norm(raw));
  if (exact) {
    const hit = pick(exact);
    // Real city, wrong province — the pairing is what fails, not the name.
    if (prov && !exact.some((e) => e.province === prov)) {
      return {
        input: raw,
        status: "suggest",
        suggestion: hit.name,
        wrongProvince: hit.province,
      };
    }
    return { input: raw, status: "ok", suggestion: hit.name };
  }

  const near = closest(
    raw,
    cityKeys.map((c) => ({ key: c.key, value: c.entry.name }))
  );
  if (near) return { input: raw, status: "suggest", suggestion: near };

  // "Mampang Zamboanga City" — a barangay glued in front of a real city. Take
  // the longest known city name contained in what they wrote.
  const a = norm(raw);
  let contained: CityEntry | undefined;
  let containedLen = 0;
  for (const c of cityKeys) {
    if (c.key.length < 5) continue;
    // Whole-word containment, so "Bay" does not match inside "Bayambang".
    const re = new RegExp(`(^|\\s)${c.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`);
    if (re.test(a) && c.key.length > containedLen) {
      contained = c.entry;
      containedLen = c.key.length;
    }
  }
  if (contained) {
    return { input: raw, status: "suggest", suggestion: contained.name };
  }

  return { input: raw, status: "unknown" };
}

/** Turn a city/province pair into the warnings staff should act on. */
export function placeIssues(
  pairs: {
    cityLabel: string;
    provinceLabel: string;
    city?: string;
    province?: string;
    group: "birth" | "delivery";
  }[]
): PlaceIssue[] {
  const out: PlaceIssue[] = [];

  for (const p of pairs) {
    if (p.province?.trim()) {
      const r = checkProvince(p.province);
      if (r.status === "suggest") {
        out.push({
          label: p.provinceLabel,
          input: r.input,
          kind: "spelling",
          suggestion: r.suggestion,
          group: p.group,
          fix: { field: "province", value: r.suggestion! },
          message: `"${r.input}" isn't a province — did they mean ${r.suggestion}?`,
        });
      } else if (r.status === "unknown") {
        out.push({
          label: p.provinceLabel,
          input: r.input,
          kind: "unknown",
          group: p.group,
          message: `"${r.input}" is not a Philippine province.`,
        });
      }
    }

    if (p.city?.trim()) {
      const r = checkCity(p.city, p.province);
      if (r.wrongProvince) {
        out.push({
          label: p.cityLabel,
          input: r.input,
          kind: "province_mismatch",
          suggestion: r.wrongProvince,
          group: p.group,
          fix: { field: "province", value: r.wrongProvince },
          message: `${r.suggestion} is in ${r.wrongProvince}, not ${p.province}.`,
        });
      } else if (r.status === "suggest") {
        out.push({
          label: p.cityLabel,
          input: r.input,
          kind: "spelling",
          suggestion: r.suggestion,
          group: p.group,
          fix: { field: "city", value: r.suggestion! },
          message: `"${r.input}" isn't a city or municipality — did they mean ${r.suggestion}?`,
        });
      } else if (r.status === "unknown") {
        out.push({
          label: p.cityLabel,
          input: r.input,
          kind: "unknown",
          group: p.group,
          message: `"${r.input}" is not a Philippine city or municipality.`,
        });
      }
    }
  }

  return out;
}

/** A short message staff can send the customer to confirm. */
export function confirmationMessage(issues: PlaceIssue[]): string {
  if (issues.length === 0) return "";
  const lines = issues.map((i) => {
    if (i.kind === "province_mismatch") {
      return `• ${i.label}: ${i.message}`;
    }
    if (i.suggestion) {
      return `• ${i.label}: napunta po "${i.input}" — ${i.suggestion} po ba ang tama?`;
    }
    return `• ${i.label}: hindi po namin makita ang "${i.input}" sa listahan.`;
  });
  return [
    "Hi po! Pa-confirm lang po sa address/details ninyo bago namin i-process:",
    "",
    ...lines,
    "",
    "Pakisagot po para hindi ma-reject o mali ang padala. Salamat po!",
  ].join("\n");
}
