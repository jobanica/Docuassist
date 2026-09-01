/**
 * The people named on an order's documents, for finding and showing an order
 * by someone other than the customer it was booked under.
 *
 * An order is one customer record, but its documents can each be about a
 * different person — a mother books two birth certificates, her own and her
 * daughter's, under her own name. The board searched only the customer, so the
 * daughter's certificate was invisible to a search for the daughter. These pull
 * the names off the documents so both can be found and seen.
 *
 * Field-key based rather than schema-driven: the board has the form_details but
 * not each service's field list, and these keys are stable across the
 * templates that use them.
 */

function join(...parts: (string | undefined)[]): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every distinct full name a document names — its owner, and on a marriage
 * certificate both spouses. Used for the display hint, so staff see whose
 * document each one is.
 */
export function documentOwnerNames(
  details: Record<string, string> | null | undefined
): string[] {
  const d = details ?? {};
  const out: string[] = [];

  const husband = join(d.husband_first, d.husband_middle, d.husband_last);
  const wife = join(d.wife_first, d.wife_middle, d.wife_last);
  if (husband) out.push(husband);
  if (wife) out.push(wife);

  // The owner block (birth, CENOMAR, TIN, PhilHealth, death) — first/middle/last.
  const owner = join(d.first_name, d.middle_name, d.last_name);
  if (owner) out.push(owner);

  return out;
}

/**
 * Two names for the same person, allowing for a middle name on one side.
 *
 * The customer record is often "Muting Nardo" and the certificate owner "Muting
 * Bajao Nardo" — the same woman, a middle name apart. So a name counts as the
 * customer's when every word of the shorter is in the longer; that keeps the
 * booker's own document from being flagged as someone else's while still
 * surfacing a genuinely different person.
 */
export function sameParty(a: string, b: string): boolean {
  const wa = a.toLowerCase().split(/\s+/).filter(Boolean);
  const wb = b.toLowerCase().split(/\s+/).filter(Boolean);
  if (wa.length === 0 || wb.length === 0) return false;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return short.every((w) => long.includes(w));
}

/**
 * Everything on a document worth matching a search against — the owner and
 * spouse names above, plus the parents, since staff also search by a parent.
 * Returned as one lower-cased string ready to test against.
 */
export function documentSearchText(
  details: Record<string, string> | null | undefined
): string {
  const d = details ?? {};
  const names = [
    ...documentOwnerNames(d),
    join(d.father_first, d.father_middle, d.father_last),
    join(d.mother_first, d.mother_middle, d.mother_last),
  ];
  return names.filter(Boolean).join(" ").toLowerCase();
}
