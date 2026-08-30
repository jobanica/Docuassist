/**
 * Tier-1 parser tests (§9). No test runner dependency — run with:
 *   npm run test:parser
 */
import { checkCity, checkProvince, placeIssues } from "@/lib/parse/places";
import { DELIVERY_FIELDS, DELIVERY_ONLY_IN_BLOCK, NEVER_IN_DELIVERY_BLOCK } from "@/lib/parse/delivery";
import {
  parseTier1,
  normalizeDate,
  splitFullName,
  expandNameGroups,
  normalizeSex,
} from "@/lib/parse/tier1";
import { stripCodeFences } from "@/lib/parse/tier2";
import type { FormFieldDef } from "@/lib/types";

const fields: FormFieldDef[] = [
  { key: "full_name_on_record", label: "Full Name on Record", type: "text", required: true,
    synonyms: ["full name","pangalan","name","name on certificate"] },
  { key: "date_of_event", label: "Date of Birth", type: "date", required: true,
    synonyms: ["birthdate","date of birth","dob","kapanganakan","birthday"] },
  { key: "place_of_event", label: "Place of Birth", type: "text", required: true,
    synonyms: ["place of birth","lugar ng kapanganakan","pob"] },
  { key: "mothers_maiden_name", label: "Mother's Maiden Name", type: "text", required: false,
    synonyms: ["mother","nanay","ina","pangalan ng ina","maiden name"] },
  { key: "copies", label: "No. of Copies", type: "number", required: false,
    synonyms: ["copies","kopya"] },
];

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); }
}

console.log("\n[1] Clean labelled reply (the happy path)");
let r = parseTier1(`Full Name: Juan Dela Cruz
Date of Birth: 1990-01-05
Place of Birth: Quezon City
Mother's Maiden Name: Maria Santos
Copies: 2`, fields);
check("full name", r.values.full_name_on_record, "Juan Dela Cruz");
check("date iso", r.values.date_of_event, "1990-01-05");
check("place", r.values.place_of_event, "Quezon City");
check("mother", r.values.mothers_maiden_name, "Maria Santos");
check("copies", r.values.copies, "2");
check("no missing required", r.missingRequired, []);

console.log("\n[2] Taglish labels + politeness particles + typos");
r = parseTier1(`Pangalan po: Ana Reyes
Kapanganakan: January 12, 1995
Lugar ng kapanganakan po: Cebu City
Pangalan ng ina: Rosa Reyes`, fields);
check("taglish name", r.values.full_name_on_record, "Ana Reyes");
check("taglish date -> iso", r.values.date_of_event, "1995-01-12");
check("taglish place", r.values.place_of_event, "Cebu City");
check("taglish mother", r.values.mothers_maiden_name, "Rosa Reyes");

console.log("\n[3] Typo'd labels + dash separators + mixed case");
r = parseTier1(`FULL NAEM - Pedro Cruz
birthdate - 5/12/1988
place of brith - Davao`, fields);
check("typo 'NAEM'", r.values.full_name_on_record, "Pedro Cruz");
check("numeric date M/D/Y", r.values.date_of_event, "1988-05-12");
check("typo 'brith'", r.values.place_of_event, "Davao");

console.log("\n[4] A stray line is not glued onto a single-line field");
// This used to join into "Calamba Laguna", which is not a city. A city, a
// province and a name are one line each; only an address wraps.
r = parseTier1(`Full Name: Jose Rizal
Place of Birth: Calamba
Laguna`, fields);
check("place keeps just its own value", r.values.place_of_event, "Calamba");
check("the name is untouched", r.values.full_name_on_record, "Jose Rizal");

console.log("\n[5] Freeform (no labels) -> Tier 1 finds nothing, flags required");
r = parseTier1(`hi po gusto ko po sana mag request ng birth certificate salamat po`, fields);
check("nothing filled", r.filledKeys, []);
check("all 3 required missing", r.missingRequired.sort(),
  ["date_of_event","full_name_on_record","place_of_event"]);

console.log("\n[6] Date normalization edge cases");
check("D/M/Y (day>12)", normalizeDate("25/12/1990"), "1990-12-25");
check("Jan. 5 1990", normalizeDate("Jan. 5, 1990"), "1990-01-05");
check("5 Feb 2001", normalizeDate("5 Feb 2001"), "2001-02-05");
check("garbage -> blank", normalizeDate("sometime last year"), "");

console.log("\n[7] Code fence stripping (Tier 2 defense)");
check("json fence", stripCodeFences('```json\n{"a":1}\n```'), '{"a":1}');
check("bare fence", stripCodeFences('```\n{"a":1}\n```'), '{"a":1}');
check("no fence", stripCodeFences('{"a":1}'), '{"a":1}');

console.log("\n[8] Full-name splitting (PSA has three boxes)");
for (const [input, want] of [
  ["Juan Miguel Dela Cruz", "Juan|Miguel|Dela Cruz"],
  ["Maria Clara Santos", "Maria|Clara|Santos"],
  ["Pedro Cruz", "Pedro||Cruz"],
  ["Madonna", "Madonna||"],
  ["Jose De los Santos", "Jose||De los Santos"],
  ["Ana Marie Sta. Maria", "Ana|Marie|Sta. Maria"],
] as const) {
  const r = splitFullName(input);
  check(input, `${r.first}|${r.middle}|${r.last}`, want);
}

console.log("\n[9] Name groups expand into the form's boxes");
{
  const fields = [
    { key: "first_name", label: "First Name", type: "text", required: true },
    { key: "middle_name", label: "Middle Name", type: "text", required: false },
    { key: "last_name", label: "Last Name", type: "text", required: true },
    { key: "mother_first", label: "Mother — First Name", type: "text", required: false },
    { key: "mother_middle", label: "Mother — Middle Name", type: "text", required: false },
    { key: "mother_last", label: "Mother — Maiden Last Name", type: "text", required: false },
  ] as any;

  const v: Record<string, string> = {
    first_name: "Juan Miguel Dela Cruz",
    mother_first: "Maria Clara Santos",
  };
  expandNameGroups(v, fields);
  check("owner last", v.last_name, "Dela Cruz");
  check("owner first", v.first_name, "Juan");
  check("owner middle", v.middle_name, "Miguel");
  check("mother last", v.mother_last, "Santos");

  // A surname the customer gave separately is never overwritten.
  const v2: Record<string, string> = {
    first_name: "Juan Miguel",
    last_name: "Reyes",
  };
  expandNameGroups(v2, fields);
  check("explicit surname kept", v2.last_name, "Reyes");
  check("explicit first kept", v2.first_name, "Juan Miguel");
}

console.log("\n[10] Repeated labels under person headings (the real template)");
{
  const psa = [
    { key: "last_name", label: "Last Name", type: "text", required: true, synonyms: ["apelyido","surname"] },
    { key: "first_name", label: "First Name", type: "text", required: true, synonyms: ["first name"] },
    { key: "middle_name", label: "Middle Name", type: "text", required: false, synonyms: ["middle name"] },
    { key: "sex", label: "Sex", type: "text", required: false, synonyms: ["sex"] },
    { key: "date_of_event", label: "Date of Birth", type: "date", required: true, synonyms: ["date of birth"] },
    { key: "birth_city", label: "Place of Birth — City", type: "text", required: true, synonyms: ["place of birth","city"] },
    { key: "birth_province", label: "Place of Birth — Province", type: "text", required: false, synonyms: ["province"] },
    { key: "father_last", label: "Father — Last Name", type: "text", required: false, synonyms: ["father last name"] },
    { key: "father_first", label: "Father — First Name", type: "text", required: false, synonyms: ["pangalan ng ama","father"] },
    { key: "father_middle", label: "Father — Middle Name", type: "text", required: false, synonyms: ["father middle name"] },
    { key: "mother_last", label: "Mother — Maiden Last Name", type: "text", required: false, synonyms: ["mother last name"] },
    { key: "mother_first", label: "Mother — First Name", type: "text", required: false, synonyms: ["pangalan ng ina","mother"] },
    { key: "mother_middle", label: "Mother — Middle Name", type: "text", required: false, synonyms: ["mother middle name"] },
  ] as any;

  const r = parseTier1(`APILYEDO: Nasari
FIRST NAME: Evin khan
MIDDLE NAME: Tan

SEX: Male
DATE OF BIRTH: 11/25/2000

PLACE OF BIRTH
Mampang Zamboanga City
Province: Zamboanga del sur

NAME OF FATHER
APILYEDO: Tan
FIRST NAME: Pedro
MIDDLE NAME: Cruz

NAME OF MOTHER
APILYEDO: Lim
FIRST NAME: Candice
MIDDLE NAME: Reyes`, psa);

  check("applicant surname not stolen by a parent", r.values.last_name, "Nasari");
  check("applicant first name", r.values.first_name, "Evin khan");
  check("applicant middle name", r.values.middle_name, "Tan");
  check("father last", r.values.father_last, "Tan");
  check("father first", r.values.father_first, "Pedro");
  check("father middle", r.values.father_middle, "Cruz");
  check("mother last", r.values.mother_last, "Lim");
  check("mother first", r.values.mother_first, "Candice");
  check("mother middle", r.values.mother_middle, "Reyes");
  check("bare label, value on next line", r.values.birth_city, "Mampang Zamboanga City");
  check("typo APILYEDO still matched", r.values.last_name, "Nasari");
  check("nothing required missing", r.missingRequired, []);

  // A bare name line straight after a person heading.
  const r2 = parseTier1(`NAME OF FATHER
Pedro Reyes Dela Cruz`, psa);
  check("bare name under a heading", r2.values.father_first, "Pedro Reyes Dela Cruz");
}

console.log("\n[11] Delivery details, kept apart from the birthplace");
{
  const doc = [
    { key: "last_name", label: "Last Name", type: "text", required: true, synonyms: ["apelyido"] },
    { key: "first_name", label: "First Name", type: "text", required: true, synonyms: ["first name"] },
    { key: "birth_city", label: "Place of Birth — City", type: "text", required: true, synonyms: ["place of birth","city"] },
    { key: "birth_province", label: "Place of Birth — Province", type: "text", required: false, synonyms: ["province"] },
  ] as any;
  const fields = [...doc, ...DELIVERY_FIELDS] as any;
  const opts = { deliveryOnly: DELIVERY_ONLY_IN_BLOCK, documentOnly: NEVER_IN_DELIVERY_BLOCK };

  const r = parseTier1(`APELYIDO: Nasari
FIRST NAME: Evin
PLACE OF BIRTH
Mampang Zamboanga City
Province: Zamboanga del sur
CONTACT NUMBER: 0917 123 4567

DELIVERY ADDRESS
Blk 5 Lot 12 Mahogany St
Barangay: Talon Uno
City: Las Pinas City
Province: Metro Manila
ZIP: 1747`, fields, opts);

  check("birthplace city stays the birthplace", r.values.birth_city, "Mampang Zamboanga City");
  check("birthplace province stays", r.values.birth_province, "Zamboanga del sur");
  check("delivery city is the address", r.values.delivery_city, "Las Pinas City");
  check("delivery province is the address", r.values.delivery_province, "Metro Manila");
  check("barangay", r.values.delivery_barangay, "Talon Uno");
  check("zip", r.values.delivery_zip, "1747");
  check("phone found outside a block", r.values.delivery_phone, "0917 123 4567");
  check("bare address line under the heading", r.values.delivery_address_line, "Blk 5 Lot 12 Mahogany St");
  check("delivery block did not steal the name", r.values.last_name, "Nasari");
}

console.log("\n[12] Real cities and provinces (PSGC)");
{
  const city = (c: string, p?: string) => { const r = checkCity(c, p); return `${r.status}${r.suggestion ? ":" + r.suggestion : ""}${r.wrongProvince ? " (in " + r.wrongProvince + ")" : ""}`; };
  const prov = (v: string) => { const r = checkProvince(v); return `${r.status}${r.suggestion ? ":" + r.suggestion : ""}`; };

  check("exact city", city("Las Piñas City"), "ok:City of Las Piñas");
  check("no accent typed", city("Las Pinas City"), "ok:City of Las Piñas");
  check("City of X written as X City", city("Batac City"), "ok:City of Batac");
  check("plain municipality", city("Adams"), "ok:Adams");
  check("misspelled city", city("Zamboango City"), "suggest:City of Zamboanga");
  check("barangay glued to a city", city("Mampang Zamboanga City"), "suggest:City of Zamboanga");
  check("pure nonsense", city("Xyzzyville"), "unknown");

  check("exact province", prov("Zamboanga del Sur"), "ok:Zamboanga Del Sur");
  check("misspelled province", prov("Zamboanga del sor"), "suggest:Zamboanga Del Sur");
  check("NCR alias", prov("NCR"), "ok:Metro Manila");
  check("not a province", prov("Talon Uno"), "unknown");

  // A real city paired with the wrong province.
  check("city/province mismatch", city("Cebu City", "Metro Manila"), "suggest:City of Cebu (in Cebu)");
  // The same name in two provinces resolves by the province given.
  check("San Fernando, La Union", city("San Fernando", "La Union"), "ok:City of San Fernando");
  check("San Fernando, Pampanga", city("San Fernando", "Pampanga"), "ok:City of San Fernando");

  const issues = placeIssues([
    { group: "delivery", cityLabel: "Delivery city", provinceLabel: "Delivery province",
      city: "Zamboango City", province: "Zamboanga del sor" },
  ]);
  check("issues raised", issues.length, 2);
  check("province issue reads well", issues[0].message,
    '"Zamboanga del sor" isn\'t a province — did they mean Zamboanga Del Sur?');
}

console.log("\n[13] Template instructions are not values");
{
  const f = [
    { key: "mother_first", label: "Mother — First Name", type: "text", required: false, synonyms: ["pangalan ng ina"] },
    { key: "father_first", label: "Father — First Name", type: "text", required: false, synonyms: ["pangalan ng ama"] },
  ] as any;
  const r = parseTier1(`Pangalan ng ina: (PANGALAN SA DALAGA PA)
Pangalan ng ama: Antonio Layo (kung meron)`, f);
  check("bare instruction is not stored", r.values.mother_first, undefined);
  check("instruction stripped off a real value", r.values.father_first, "Antonio Layo");
}

console.log("\n[14] The reported delivery block");
{
  const f = [...DELIVERY_FIELDS] as any;
  const opts = { deliveryOnly: DELIVERY_ONLY_IN_BLOCK, documentOnly: NEVER_IN_DELIVERY_BLOCK };
  const r = parseTier1(`DELIVERY DETAILS
RECEIVER NAME:
PHONE NUMBER 1: 09566034051
PHONE NUMBER 2:09975463155
PUROK/STREET: purok8, New Alimodian
BARANGAY: Banayal
CITY: Tulunan
PROVINCE: Cotabato ( north)
NEED LANDMARK;`, f, opts);

  check("purok/street is the address line", r.values.delivery_address_line, "purok8, New Alimodian");
  check("an unanswered prompt is not an address", r.values.delivery_address_line !== "RECEIVER NAME:", true);
  check("first phone wins", r.values.delivery_phone, "09566034051");
  check("barangay", r.values.delivery_barangay, "Banayal");
  check("city", r.values.delivery_city, "Tulunan");
  check("trailing note not glued to the province", r.values.delivery_province, "Cotabato");

  // The parsed pair must not raise a false alarm.
  check("Tulunan + Cotabato accepted", placeIssues([
    { group: "delivery", cityLabel: "Delivery city", provinceLabel: "Delivery province",
      city: r.values.delivery_city, province: r.values.delivery_province },
  ]).length, 0);
  // An aside in a hand-typed province is tolerated, not flagged.
  check("province with an aside accepted", checkProvince("Cotabato ( north)").status, "ok");
  // A wrong pairing is still caught.
  check("wrong province still caught", placeIssues([
    { group: "delivery", cityLabel: "Delivery city", provinceLabel: "Delivery province",
      city: "Tulunan", province: "Davao del Sur" },
  ])[0].message, "Tulunan is in Cotabato, not Davao del Sur.");

  // A name shared by several provinces must offer all of them. Carmen exists
  // six times over; naming only the first sends staff to "fix" a province that
  // may well have been right.
  const carmen = placeIssues([
    { group: "birth", cityLabel: "Place of birth — city", provinceLabel: "Place of birth — province",
      city: "Carmen", province: "Davao del Sur" },
  ])[0];
  check("every Carmen province is offered",
    [carmen.fix!.value, ...(carmen.alternatives ?? [])].join(", "),
    "Agusan Del Norte, Bohol, Cebu, Cotabato, Davao Del Norte, Surigao Del Sur");
  check("the message names them all", carmen.message,
    'There are 6 places called "Carmen" — in Agusan Del Norte, Bohol, Cebu, Cotabato, Davao Del Norte or Surigao Del Sur — but none in Davao del Sur.');
  // Carmen really is in Davao del Norte, so that pairing must still pass.
  check("Carmen + Davao del Norte accepted", placeIssues([
    { group: "birth", cityLabel: "Place of birth — city", provinceLabel: "Place of birth — province",
      city: "Carmen", province: "Davao del Norte" },
  ]).length, 0);
}

console.log("\n[15] Sex is one of two answers, or nothing");
for (const [input, want] of [
  ["Female", "Female"], ["female", "Female"], ["F", "Female"], ["babae", "Female"],
  ["Male", "Male"], ["lalaki", "Male"], ["M", "Male"],
  ["September 8 2014", undefined], ["", undefined], ["yes", undefined],
] as const) {
  const v: Record<string, string> = input ? { sex: input } : {};
  normalizeSex(v);
  check(`"${input}" -> ${want ?? "dropped"}`, v.sex, want);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);