import { NextResponse } from "next/server";
import { barangaysOfCity } from "@/lib/data/psgc-barangays";

/**
 * The barangays of one city or municipality.
 *
 * All 42,000 of them together are most of a megabyte — no phone on mobile data
 * should download that to fill in one field. They are sent a city at a time,
 * only once a city has been chosen, and the answer is cached hard: the PSGC
 * changes a handful of times a year, not a handful of times a day.
 *
 * `city` is the index into CITIES that lib/psgc hands the picker, not a PSGC
 * code — it is what the bundled barangay table is keyed on.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("city");
  const index = Number(raw);
  const names =
    raw !== null && Number.isInteger(index) && index >= 0
      ? barangaysOfCity(index)
      : [];
  return NextResponse.json(
    { names },
    { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } }
  );
}
