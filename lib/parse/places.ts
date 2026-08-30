import { CITIES, PROVINCES } from "@/lib/data/psgc";
import { levenshtein } from "./labels";
import { barangaysOfCity } from "@/lib/data/psgc-barangays";

export { documentPlacePair, type PlacePair } from "./place-fields";

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
  /** Every province that has a city or municipality by this name. 114 of them
   *  are shared — there are six Carmens and nine San Isidros — so naming only
   *  the first would send staff to correct a province that was never wrong. */
  provinces?: string[];
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
  /**
   * One-click corrections, in the order they should be offered.
   *
   * A patch rather than a single field, because the right answer is often
   * both: "Roseller Rt Lim Zamboanga Sibugay" typed into the city box is a
   * city AND a province, and fixing only one of them leaves the other wrong.
   * A city name shared by several provinces offers one patch per province —
   * there is no single right answer, so staff pick rather than being guessed
   * at.
   */
  fixes?: PlaceFix[];
}

export interface PlaceFix {
  /** What the button says, e.g. `Roseller Lim, Zamboanga Sibugay`. */
  label: string;
  patch: { city?: string; province?: string; barangay?: string };
}

/** "a, b or c" — for listing every province a shared city name belongs to. */
function joinOr(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
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
  /** Index into CITIES, which is how the barangay list is keyed. */
  index: number;
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
    if (!list.some((e) => e.index === entry.index)) {
      list.push(entry);
    }
  } else {
    cityByAlias.set(k, [entry]);
  }
  cityKeys.push({ key: k, entry });
}

CITIES.forEach(([name, provIdx], index) => {
  const entry: CityEntry = { name, province: PROVINCES[provIdx], index };
  addAlias(name, entry);
  // PSGC writes "City of Batac"; customers write "Batac City" or "Batac".
  const cityOf = name.match(/^City of (.+)$/i);
  if (cityOf) {
    addAlias(`${cityOf[1]} City`, entry);
    addAlias(cityOf[1], entry);
  }
  const trailing = name.match(/^(.+) City$/i);
  if (trailing) addAlias(trailing[1], entry);
});

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

/** Cities indexed by province, so a known province narrows the search. */
const cityKeysByProvince = new Map<string, { key: string; entry: CityEntry }[]>();
for (const c of cityKeys) {
  const list = cityKeysByProvince.get(c.entry.province);
  if (list) list.push(c);
  else cityKeysByProvince.set(c.entry.province, [c]);
}

/** Province aliases longest-first, so "Zamboanga Sibugay" wins over "Zamboanga". */
const provinceAliases = Array.from(provinceByAlias.entries()).sort(
  (a, b) => b[0].length - a[0].length
);

function words(v: string): string[] {
  return norm(v).split(" ").filter(Boolean);
}

/**
 * Pull a province out of free text and hand back what is left.
 *
 * Customers routinely type the whole place into the city box — "casacon
 * roseller Rt lim Zamboanga sibugay" is a barangay, a municipality and a
 * province in one line. Peeling the province off is what makes the rest
 * matchable at all.
 */
function peelProvince(input: string): { province?: string; rest: string } {
  const a = norm(input);
  if (!a) return { rest: "" };
  for (const [alias, canonical] of provinceAliases) {
    if (alias.length < 4) continue;
    const re = new RegExp(
      `(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`
    );
    if (re.test(a)) {
      return { province: canonical, rest: a.replace(re, " ").replace(/\s+/g, " ").trim() };
    }
  }
  return { rest: a };
}

/**
 * Do all of a city's words appear in the input, in order?
 *
 * "Roseller Lim" against "casacon roseller rt lim" — the initial sitting in
 * the middle is exactly how people write "Roseller T. Lim", and neither a
 * whole-phrase containment test nor an edit distance gets there.
 */
function wordsInOrder(name: string[], input: string[]): boolean {
  if (name.length === 0) return false;
  // Short names ("Bay", "Naga") match far too much this way; those are already
  // handled by the exact and containment passes.
  if (name.join("").length < 6) return false;
  let i = 0;
  for (const w of input) {
    if (w === name[i]) i++;
    if (i === name.length) return true;
  }
  return false;
}

/**
 * Last resort for a city box holding more than a city: peel the province, then
 * find the municipality inside what is left. Returns both, because correcting
 * only one of them leaves the other wrong.
 */
export function resolveCompound(
  cityInput: string,
  provinceInput?: string
): { city: string; province: string } | null {
  const peeled = peelProvince(cityInput);
  // The province named in the city box wins over an empty province field, and
  // over one that disagrees — the customer wrote them together for a reason.
  const provinceGuess =
    peeled.province ??
    (provinceInput?.trim()
      ? provinceByAlias.get(norm(provinceInput)) ?? undefined
      : undefined);
  if (!provinceGuess) return null;

  const rest = words(peeled.rest);
  if (rest.length === 0) return null;

  const candidates = cityKeysByProvince.get(provinceGuess) ?? [];
  let best: CityEntry | undefined;
  let bestLen = 0;
  for (const c of candidates) {
    const name = c.key.split(" ").filter(Boolean);
    if (!wordsInOrder(name, rest)) continue;
    if (c.key.length > bestLen) {
      best = c.entry;
      bestLen = c.key.length;
    }
  }
  if (!best) return null;
  return { city: best.name, province: provinceGuess };
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
      const provinces = Array.from(new Set(exact.map((e) => e.province))).sort();
      return {
        input: raw,
        status: "suggest",
        suggestion: hit.name,
        wrongProvince: provinces[0],
        provinces,
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

/**
 * Resolve what a customer wrote in the city box to an actual city, using the
 * same passes the warning does. Used by the barangay check, which is only
 * meaningful once the city is known.
 */
function resolveCity(city?: string, province?: string): CityEntry | null {
  const raw = (city ?? "").trim();
  if (!raw) return null;
  const prov = province?.trim()
    ? provinceByAlias.get(norm(province)) ?? undefined
    : undefined;

  const exact = cityByAlias.get(norm(raw));
  if (exact) {
    return (prov && exact.find((e) => e.province === prov)) || exact[0];
  }
  const compound = resolveCompound(raw, province);
  if (compound) {
    const list = cityByAlias.get(norm(compound.city));
    const hit = list?.find((e) => e.province === compound.province);
    if (hit) return hit;
  }
  return null;
}

/**
 * Is the barangay one of that city's?
 *
 * A barangay is where a parcel actually goes — couriers sort on it — and it is
 * the field customers most often fill with a subdivision or a street. The
 * check only runs once the city is known, because "San Rafael" exists in
 * hundreds of towns and means nothing on its own.
 */
export function checkBarangay(
  barangay: string,
  city?: string,
  province?: string
): {
  status: "ok" | "suggest" | "unknown";
  suggestion?: string;
  city?: string;
  /** The suggestion came out of the city box, not the barangay box. */
  fromCityBox?: boolean;
} {
  const raw = barangay.trim();
  if (!raw) return { status: "ok" };
  const entry = resolveCity(city, province);
  // No city, no verdict: the city warning is the one to act on first.
  if (!entry) return { status: "ok" };

  const list = barangaysOfCity(entry.index);
  if (list.length === 0) return { status: "ok" };

  const a = norm(raw);
  const keyed = list.map((n) => ({ key: norm(n), value: n }));

  for (const b of keyed) if (b.key === a) return { status: "ok", suggestion: b.value };

  // "San Rafael Village Kaimito St." — the barangay is in there, wrapped in a
  // subdivision and a street. Longest whole-word match wins.
  let contained: string | undefined;
  let containedLen = 0;
  for (const b of keyed) {
    if (b.key.length < 4) continue;
    const re = new RegExp(
      `(^|\\s)${b.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`
    );
    if (re.test(a) && b.key.length > containedLen) {
      contained = b.value;
      containedLen = b.key.length;
    }
  }
  if (contained) return { status: "suggest", suggestion: contained, city: entry.name };

  const near = closest(raw, keyed);
  if (near) return { status: "suggest", suggestion: near, city: entry.name };

  // Nothing in the barangay box is a barangay — but the city box often holds
  // one, because the customer wrote "mabiga mabalacat" there and put their
  // subdivision in the barangay field. If the leftovers name a real barangay
  // of this city, that is almost certainly the one they meant.
  const spare = norm(city ?? "").split(" ").filter(Boolean);
  if (spare.length > 1) {
    for (const b of keyed) {
      if (b.key.length < 4) continue;
      if (spare.includes(b.key)) {
        return {
          status: "suggest",
          suggestion: b.value,
          city: entry.name,
          fromCityBox: true,
        };
      }
    }
  }

  return { status: "unknown", city: entry.name };
}

/** Turn a city/province pair into the warnings staff should act on. */
export function placeIssues(
  pairs: {
    cityLabel: string;
    provinceLabel: string;
    city?: string;
    province?: string;
    /** Only the delivery pair has one; a PSA form asks for city and province. */
    barangayLabel?: string;
    barangay?: string;
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
          fixes: [
            { label: r.suggestion!, patch: { province: r.suggestion! } },
          ],
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

    // Worked out before the city warning is written, because when the answer
    // came out of the city box the city fix has to carry it: correcting the
    // city on its own throws away the only evidence of what the barangay was.
    const bar =
      p.barangay?.trim() && p.barangayLabel
        ? checkBarangay(p.barangay, p.city, p.province)
        : null;
    const barangayFromCityBox =
      bar?.fromCityBox && bar.suggestion ? bar.suggestion : null;

    if (p.city?.trim()) {
      const r = checkCity(p.city, p.province);

      // A city box holding a whole address is the common shape of this: peel
      // the province out of it and the municipality inside usually resolves,
      // where matching the line as one city name never could.
      const compound =
        r.status === "ok" ? null : resolveCompound(p.city, p.province);
      if (compound) {
        const provinceChanges =
          !p.province?.trim() ||
          norm(p.province) !== norm(compound.province);
        out.push({
          label: p.cityLabel,
          input: r.input,
          kind: "spelling",
          suggestion: compound.city,
          group: p.group,
          fixes: [
            {
              label: [
                compound.city,
                provinceChanges ? compound.province : null,
                barangayFromCityBox,
              ]
                .filter(Boolean)
                .join(", "),
              patch: {
                city: compound.city,
                ...(provinceChanges ? { province: compound.province } : {}),
                ...(barangayFromCityBox
                  ? { barangay: barangayFromCityBox }
                  : {}),
              },
            },
          ],
          message: [
            provinceChanges
              ? `"${r.input}" reads as ${compound.city} in ${compound.province} — the province was written in the city box.`
              : `"${r.input}" isn't a city or municipality — did they mean ${compound.city}?`,
            barangayFromCityBox
              ? `"${barangayFromCityBox}" in there is its barangay, which is what the barangay box should hold.`
              : null,
          ]
            .filter(Boolean)
            .join(" "),
        });
      } else if (r.wrongProvince) {
        const provinces = r.provinces ?? [r.wrongProvince];
        out.push({
          label: p.cityLabel,
          input: r.input,
          kind: "province_mismatch",
          suggestion: r.wrongProvince,
          group: p.group,
          fixes: provinces.map((v) => ({ label: v, patch: { province: v } })),
          message:
            provinces.length > 1
              // Named by what they wrote, not by one match: the same alias can
              // cover a city and a municipality with slightly different
              // official names, and only the provinces are certain.
              ? `There are ${provinces.length} places called "${r.input}" — in ${joinOr(
                  provinces
                )} — but none in ${p.province}.`
              : `${r.suggestion} is in ${r.wrongProvince}, not ${p.province}.`,
        });
      } else if (r.status === "suggest") {
        out.push({
          label: p.cityLabel,
          input: r.input,
          kind: "spelling",
          suggestion: r.suggestion,
          group: p.group,
          fixes: [
            {
              label: [r.suggestion!, barangayFromCityBox]
                .filter(Boolean)
                .join(", "),
              patch: {
                city: r.suggestion!,
                ...(barangayFromCityBox
                  ? { barangay: barangayFromCityBox }
                  : {}),
              },
            },
          ],
          message: barangayFromCityBox
            ? `"${r.input}" reads as ${r.suggestion} — and "${barangayFromCityBox}" in there is its barangay, which is what the barangay box should hold.`
            : `"${r.input}" isn't a city or municipality — did they mean ${r.suggestion}?`,
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

    if (bar && p.barangayLabel) {
      const b = bar;
      const written = (p.barangay ?? "").trim();
      if (b.status === "suggest") {
        out.push({
          label: p.barangayLabel,
          input: written,
          kind: "spelling",
          suggestion: b.suggestion,
          group: p.group,
          fixes: [{ label: b.suggestion!, patch: { barangay: b.suggestion! } }],
          message: `"${written}" isn't a barangay of ${b.city} — did they mean ${b.suggestion}?`,
        });
      } else if (b.status === "unknown") {
        out.push({
          label: p.barangayLabel,
          input: written,
          kind: "unknown",
          group: p.group,
          message: `${b.city} has no barangay called "${written}". Couriers sort on the barangay, so a wrong one is a returned parcel.`,
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
