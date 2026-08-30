"use server";

import { run, type ActionResult } from "@/lib/action-result";
import { requireStaff } from "@/lib/auth";
import { placeIssues, type PlaceIssue } from "@/lib/parse/places";

/**
 * Check places typed by hand, not just parsed ones.
 *
 * The PSGC list is ~28KB and lives on the server, so the browser asks rather
 * than shipping the whole thing to every page.
 */
export async function checkPlaces(pairs: {
  cityLabel: string;
  provinceLabel: string;
  city?: string;
  province?: string;
  group: "birth" | "delivery";
}[]): Promise<ActionResult<PlaceIssue[]>> {
  return run(async () => {
    await requireStaff();
    return placeIssues(pairs);
  });
}
