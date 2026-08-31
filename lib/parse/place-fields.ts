/**
 * Which fields hold a document's place of event.
 *
 * Its own module, free of the PSGC data, because components import it: the
 * check itself pulls in 42,000 barangay names and none of that belongs in a
 * browser bundle.
 *
 * The city/province pair a document's place-of-event lives in.
 *
 * Every template names these differently — birth_city on a birth certificate
 * and CENOMAR, marriage_city on a marriage certificate, death_city on a death
 * certificate — so the check found the pair by hardcoding the birth keys and
 * silently did nothing on the other two. Deriving it from the form schema means
 * a template added later is covered without anyone remembering to come back
 * here.
 *
 * Delivery keys are excluded: those are the customer's address, checked as
 * their own pair.
 */
export interface PlacePair {
  cityKey: string;
  provinceKey: string;
  cityLabel: string;
  provinceLabel: string;
}

export function documentPlacePair(
  fields: { key: string; label?: string }[]
): PlacePair | null {
  for (const f of fields) {
    const m = /^(.+)_city$/.exec(f.key);
    if (!m || m[1] === "delivery") continue;
    const provinceKey = `${m[1]}_province`;
    const prov = fields.find((x) => x.key === provinceKey);
    if (!prov) continue;
    return {
      cityKey: f.key,
      provinceKey,
      cityLabel: f.label || "Place — city",
      provinceLabel: prov.label || "Place — province",
    };
  }
  return null;
}

/**
 * The document owner's name, as it should appear on the customer record.
 *
 * The reply carries two names: whose document this is, and who will accept the
 * parcel. They are often different people — a mother orders her son's CENOMAR
 * and has it sent to her sister — and the business files and searches by the
 * document's owner, so that is the one the customer record should carry.
 *
 * Returns "" when the template has no single owner to name, and the receiver
 * stands in instead:
 *
 *  - A marriage certificate is about two people, so there is no one name.
 *  - A death certificate names the deceased. They are not the customer, they
 *    cannot receive the parcel, and their first name would greet whoever
 *    opens the tracking link.
 */
export function documentOwnerName(
  fields: { key: string }[],
  values: Record<string, string>
): string {
  const has = (k: string) => fields.some((f) => f.key === k);
  if (!has("last_name") || !has("first_name")) return "";
  if (has("death_city") || has("death_province")) return "";

  return [values.first_name, values.middle_name, values.last_name]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
