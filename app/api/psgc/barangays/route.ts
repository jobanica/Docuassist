import { NextResponse } from "next/server";
import barangays from "@/lib/psgc/barangays.json";

/**
 * The barangays of one city or municipality.
 *
 * All 42,046 of them together are half a megabyte — no phone on mobile data
 * should have to download that to fill in one field. They are sent a city at a
 * time, only once a city has been chosen, and the answer is cached hard: the
 * PSGC changes a handful of times a year, not a handful of times a day.
 */
export const dynamic = "force-dynamic";

const BY_CITY = barangays as Record<string, string[]>;

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("city") ?? "";
  return NextResponse.json(
    { names: BY_CITY[code] ?? [] },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    }
  );
}
