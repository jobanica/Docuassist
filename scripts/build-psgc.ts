/**
 * Regenerate the bundled PSGC reference data from psgc.gitlab.io.
 *
 * Writes two files, together so their indexes can never drift:
 *   lib/data/psgc.ts           — provinces and cities/municipalities (~28KB)
 *   lib/data/psgc-barangays.ts — every barangay, keyed to its city (~700KB)
 *
 * The barangay file is deliberately its own module: it is only ever imported
 * by the server-side check, and pulling 42,000 names into a browser bundle to
 * validate one address would be absurd.
 *
 * Run: npx tsx scripts/build-psgc.ts
 */
import { writeFileSync } from "node:fs";

const API = "https://psgc.gitlab.io/api";

interface Place {
  code: string;
  name: string;
  provinceCode?: string | false;
  cityCode?: string | false;
  municipalityCode?: string | false;
  subMunicipalityCode?: string | false;
  districtCode?: string | false;
  regionCode?: string;
}

async function get(path: string): Promise<Place[]> {
  const res = await fetch(`${API}/${path}/`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** PSGC files Metro Manila as a region, but customers write it as a province. */
const NCR_REGION = "130000000";
const METRO_MANILA = "Metro Manila";

/**
 * Cities PSGC lists under a region with no province of their own. Customers
 * still write a province on an address, so each is filed under the one they
 * write — dropping them would lose two cities and their barangays entirely.
 */
const PROVINCELESS: Record<string, string> = {
  "129804000": "Maguindanao", // Cotabato City, enclaved in Maguindanao
  "099701000": "Basilan", // Isabela City
};

/** Title-case the way the rest of the app displays a name. */
function title(v: string): string {
  return v.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

async function main() {
  const [provinces, cities, municipalities, barangays] = await Promise.all([
    get("provinces"),
    get("cities"),
    get("municipalities"),
    get("barangays"),
  ]);

  const provinceNames = [
    ...provinces.map((p) => title(p.name)),
    METRO_MANILA,
  ].sort((a, b) => a.localeCompare(b));
  const provinceIndex = new Map(provinceNames.map((n, i) => [n, i]));

  const byCode = new Map<string, string>();
  for (const p of provinces) byCode.set(p.code, title(p.name));

  // One list of cities and municipalities: to a customer they are the same box.
  const places = [...cities, ...municipalities].map((c) => {
    const province = c.provinceCode
      ? byCode.get(String(c.provinceCode))
      : c.regionCode === NCR_REGION
        ? METRO_MANILA
        : PROVINCELESS[c.code];
    return { code: c.code, name: c.name, province };
  });
  places.sort((a, b) => a.name.localeCompare(b.name));

  const kept = places.filter((p) => p.province);
  const cityIndexByCode = new Map<string, number>();
  kept.forEach((p, i) => cityIndexByCode.set(p.code, i));

  const cityTuples = kept.map(
    (p) => `[${JSON.stringify(p.name)},${provinceIndex.get(p.province!)}]`
  );

  writeFileSync(
    "lib/data/psgc.ts",
    `// GENERATED FILE — do not edit by hand. See scripts/build-psgc.ts.
//
// Philippine provinces and cities/municipalities from the PSA's Philippine
// Standard Geographic Code (PSGC), fetched from psgc.gitlab.io. Bundled rather
// than fetched at runtime so a wrong address is caught even if that service is
// down, and so validating costs nothing per order.
//
// ${provinces.length} provinces + Metro Manila (which PSGC files as a region, but
// customers write it as a province) and ${kept.length} cities/municipalities.

export const PROVINCES: string[] = ${JSON.stringify(provinceNames)};

/** [name, index into PROVINCES] */
export const CITIES: [string, number][] = [${cityTuples.join(",")}];
`
  );

  // Barangays grouped by the city index above. A record of arrays would be
  // three times the size in quotes and commas alone; one delimited string per
  // city parses in a few milliseconds at import and keeps the file readable.
  const groups = new Map<number, string[]>();
  let orphans = 0;
  for (const b of barangays) {
    const parent =
      (b.cityCode && String(b.cityCode)) ||
      (b.municipalityCode && String(b.municipalityCode)) ||
      (b.subMunicipalityCode && String(b.subMunicipalityCode)) ||
      "";
    const idx = cityIndexByCode.get(parent);
    if (idx === undefined) {
      orphans++;
      continue;
    }
    const list = groups.get(idx);
    if (list) list.push(b.name);
    else groups.set(idx, [b.name]);
  }

  const rows = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, names]) => `${idx}|${names.join("~")}`);

  writeFileSync(
    "lib/data/psgc-barangays.ts",
    `// GENERATED FILE — do not edit by hand. See scripts/build-psgc.ts.
//
// Every barangay in the PSGC, keyed to its city/municipality by index into
// CITIES in ./psgc. ${barangays.length - orphans} barangays across ${groups.size} cities.
//
// SERVER ONLY. Import this from the place check, never from a component: a
// browser has no use for 42,000 names, and shipping them would dwarf the app.
//
// Packed as one delimited string per city — "<cityIndex>|<name>~<name>~..." —
// because the same data as nested arrays is three times the bytes in quotes
// and commas. Unpacked once, lazily, on first use.

const PACKED: string[] = ${JSON.stringify(rows)};

let unpacked: Map<number, string[]> | null = null;

/** Barangay names for a city, by its index into CITIES. */
export function barangaysOfCity(cityIndex: number): string[] {
  if (!unpacked) {
    unpacked = new Map();
    for (const row of PACKED) {
      const sep = row.indexOf("|");
      unpacked.set(Number(row.slice(0, sep)), row.slice(sep + 1).split("~"));
    }
  }
  return unpacked.get(cityIndex) ?? [];
}
`
  );

  console.log(
    `provinces ${provinceNames.length}, cities ${kept.length}, barangays ${
      barangays.length - orphans
    } (${orphans} without a listed city)`
  );
}

main();
