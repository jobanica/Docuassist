import provincesRaw from "./provinces.json";
import citiesRaw from "./cities.json";

/**
 * Philippine places, from the PSA's own Philippine Standard Geographic Code.
 *
 * Why this exists: an address typed by hand is the single most common reason a
 * parcel comes back to us. "Paranaque", "Parañaque", "Paranaque City",
 * "Paranque" — the courier sorts on the barangay and the municipality, and it
 * only takes one of those to be wrong. Picking from a list removes the typo.
 *
 * Two deliberate choices:
 *
 *   1. Nothing here is a hard gate. Every picker also accepts what the customer
 *      typed. A new barangay, a renamed one, a spelling the list has not caught
 *      up with — none of those should stop someone ordering. The list makes the
 *      right answer easy, it does not make a wrong one impossible.
 *
 *   2. Names are stored, not codes. They are what goes on a PSA request form
 *      and on a courier label, and they stay readable in the database years
 *      after a code has been retired.
 *
 * Barangays (42,046 of them) are too large to send to a phone, so they live in
 * `barangays.json` and are served a city at a time by /api/psgc/barangays.
 */
export interface Place {
  code: string;
  name: string;
}

/** Metro Manila is not a province in the PSGC, but it is the answer people
 *  give when asked for one, so it is listed as though it were. */
export const NCR_CODE = "__ncr";

export const PROVINCES = provincesRaw as Place[];

const CITIES = citiesRaw as Record<string, Place[]>;

/** Cities and municipalities inside a province, already sorted by name. */
export function citiesOf(provinceCode: string): Place[] {
  return CITIES[provinceCode] ?? [];
}

/**
 * Fold a place name down to something two spellings of it can agree on:
 * lowercase, no accents, no punctuation, and without the "City of" the PSGC
 * puts in front of what everyone else writes as plain "Manila".
 */
export function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^city of\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Does this place answer to what the customer has typed so far? */
export function matches(name: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return normalize(name).includes(q);
}

/** The province with this name, however it was spelled. */
export function findProvince(name: string): Place | undefined {
  const n = normalize(name);
  if (!n) return undefined;
  return PROVINCES.find((p) => normalize(p.name) === n);
}

/** The city or municipality with this name inside a given province. */
export function findCity(
  provinceCode: string,
  name: string
): Place | undefined {
  const n = normalize(name);
  if (!n) return undefined;
  return citiesOf(provinceCode).find((c) => normalize(c.name) === n);
}
