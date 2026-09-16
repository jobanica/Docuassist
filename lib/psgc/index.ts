import { CITIES, PROVINCES } from "@/lib/data/psgc";

/**
 * The public order form's view of the PSA's Philippine Standard Geographic Code.
 *
 * The data itself lives in lib/data/psgc.ts, where it has been since the
 * Messenger-paste parser started checking addresses against it — this module
 * only reshapes it for a picker. There is one copy of the PSGC in this repo on
 * purpose: two would drift, and then the address a customer picks on the site
 * and the address the parser accepts in the office would disagree.
 *
 * Why a picker at all: an address typed by hand is the commonest reason a
 * parcel comes back to us. "Paranaque", "Parañaque", "Paranque" — the courier
 * sorts on the barangay and the municipality, and one wrong letter there is
 * three failed attempts and a return. The same typo in a place of birth is
 * worse: the PSA searches on it, the record is not found, and the fee is spent
 * either way.
 *
 * Two deliberate choices:
 *
 *   1. Nothing here is a hard gate. Every field also accepts what the customer
 *      typed. A new barangay, a renamed one, a spelling the list has not caught
 *      up with — none should stop someone ordering. The list makes the right
 *      answer easy; it must not make a wrong one impossible.
 *
 *   2. Names are stored, not indexes. They are what goes on a PSA request form
 *      and a courier label, and they stay readable years after an index has
 *      shifted underneath them.
 *
 * Barangays (42,000 of them) are far too large to send to a phone, so they stay
 * in lib/data/psgc-barangays.ts and are served a city at a time by
 * /api/psgc/barangays.
 */

/** A city or municipality, with the index the barangay lookup is keyed on. */
export interface City {
  name: string;
  /** Position in CITIES — what barangaysOfCity() takes. */
  index: number;
}

export { PROVINCES };

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

/** The cities and municipalities of one province, sorted by name. */
export function citiesOf(province: string): City[] {
  const p = normalize(province);
  if (!p) return [];
  const provinceIndex = PROVINCES.findIndex((n) => normalize(n) === p);
  if (provinceIndex < 0) return [];
  return CITIES.map((c, index) => ({ name: c[0], index, province: c[1] }))
    .filter((c) => c.province === provinceIndex)
    .map(({ name, index }) => ({ name, index }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The city with this name inside a province, however it was spelled. */
export function findCity(province: string, name: string): City | undefined {
  const n = normalize(name);
  if (!n) return undefined;
  return citiesOf(province).find((c) => normalize(c.name) === n);
}
