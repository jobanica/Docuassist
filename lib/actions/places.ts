"use server";

import { run, type ActionResult } from "@/lib/action-result";
import { requireStaff } from "@/lib/auth";
import { placeIssues, type PlaceIssue } from "@/lib/parse/places";

/**
 * Check places typed by hand, not just parsed ones.
 *
 * The PSGC lists live on the server and stay there — 1,634 cities and 42,000
 * barangays would be an absurd thing to ship to a browser to validate one
 * address, so the browser asks instead.
 */
export async function checkPlaces(pairs: {
  cityLabel: string;
  provinceLabel: string;
  /** Delivery pairs carry one; a PSA form asks only for city and province. */
  barangayLabel?: string;
  city?: string;
  province?: string;
  barangay?: string;
  group: "birth" | "delivery";
}[]): Promise<ActionResult<PlaceIssue[]>> {
  return run(async () => {
    await requireStaff();
    return placeIssues(pairs);
  });
}
