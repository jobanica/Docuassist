/**
 * Tier-1 parser tests (§9). No test runner dependency — run with:
 *   npm run test:parser
 */
import {
  checkCity,
  checkProvince,
  placeIssues,
  documentPlacePair,
  resolveCompound,
  checkBarangay,
} from "@/lib/parse/places";
import { surnameIssues } from "@/lib/parse/surname";
import {
  DELIVERY_FIELDS,
  DELIVERY_ONLY_IN_BLOCK,
  NEVER_IN_DELIVERY_BLOCK,
  DELIVERY_TO_CUSTOMER,
} from "@/lib/parse/delivery";
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
    (carmen.fixes ?? []).map((f) => f.label).join(", "),
    "Agusan Del Norte, Bohol, Cebu, Cotabato, Davao Del Norte, Surigao Del Sur");
  check("each one patches the province", (carmen.fixes ?? [])[0].patch.province, "Agusan Del Norte");
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


console.log("\n[16] The Philippine naming rule");
{
  const both = {
    last_name: "Garilao", middle_name: "Gatona",
    father_last: "Garilao", father_first: "Mario",
    mother_last: "Gatona", mother_first: "Judy",
  };
  check("correct names raise nothing", surnameIssues("psa_birth", both).length, 0);
  check("case and spacing are not a mismatch",
    surnameIssues("psa_birth", { ...both, last_name: " garilao ", middle_name: "GATONA" }).length, 0);

  const wrongLast = surnameIssues("psa_birth", { ...both, last_name: "Santos" });
  check("wrong last name caught", wrongLast[0].field, "last_name");
  check("names the father's surname", wrongLast[0].expected, "Garilao");

  const wrongMiddle = surnameIssues("psa_birth", { ...both, middle_name: "Garilao" });
  check("married surname in the middle caught", wrongMiddle[0].field, "middle_name");

  check("a blank middle name is a gap once a father is on record",
    surnameIssues("psa_birth", { ...both, middle_name: "" })[0].field, "middle_name");

  // The exemption: no father on record, so the mother's surname is the child's.
  const single = {
    last_name: "Gatona", middle_name: "",
    father_last: "", father_first: "", mother_last: "Gatona", mother_first: "Judy",
  };
  check("single mother, mother's surname, no middle name — nothing raised",
    surnameIssues("psa_birth", single).length, 0);
  check("a father's surname with no father recorded is still questioned",
    surnameIssues("psa_birth", { ...single, last_name: "Garilao" })[0].field, "last_name");

  check("the rule applies to CENOMAR too",
    surnameIssues("cenomar", { ...both, last_name: "Santos" }).length, 1);
  check("but not to a marriage certificate",
    surnameIssues("psa_marriage", { ...both, last_name: "Santos" }).length, 0);
  check("an empty form is not a wrong one", surnameIssues("psa_birth", {}).length, 0);
}

console.log("\n[17] Every template's own place fields are checked");
{
  const birth = [
    { key: "birth_city", label: "Place of Birth — City / Municipality" },
    { key: "birth_province", label: "Place of Birth — Province" },
  ];
  const marriage = [
    { key: "marriage_city", label: "Place of Marriage — City / Municipality" },
    { key: "marriage_province", label: "Place of Marriage — Province" },
  ];
  const death = [
    { key: "death_city", label: "Place of Death — City / Municipality" },
    { key: "death_province", label: "Place of Death — Province" },
  ];
  check("birth pair found", documentPlacePair(birth)?.cityKey, "birth_city");
  check("marriage pair found", documentPlacePair(marriage)?.cityKey, "marriage_city");
  check("marriage province too", documentPlacePair(marriage)?.provinceKey, "marriage_province");
  check("death pair found", documentPlacePair(death)?.cityKey, "death_city");
  check("label comes from the schema", documentPlacePair(marriage)?.cityLabel,
    "Place of Marriage — City / Municipality");
  // A delivery address is the customer's, checked as its own pair.
  check("delivery keys are not a document pair",
    documentPlacePair([{ key: "delivery_city", label: "City" }, { key: "delivery_province", label: "Province" }]), null);
  check("a template with no place has no pair",
    documentPlacePair([{ key: "last_name", label: "Last Name" }]), null);

  // The reported case: a marriage certificate with a bad city and province.
  const pair = documentPlacePair(marriage)!;
  const issues = placeIssues([
    { group: "birth", cityLabel: pair.cityLabel, provinceLabel: pair.provinceLabel,
      city: "casacon roseller Rt lim Zamboanga sibugay", province: "pampanga" },
  ]);
  check("a wrong marriage place is now caught", issues.length > 0, true);
  check("it names the marriage field", issues[0].label, "Place of Marriage — City / Municipality");
}

console.log("\n[18] The receiver's name fills the customer");
{
  const f = [...DELIVERY_FIELDS] as any;
  const opts = { deliveryOnly: DELIVERY_ONLY_IN_BLOCK, documentOnly: NEVER_IN_DELIVERY_BLOCK };
  const r = parseTier1(`DELIVERY DETAILS
RECEIVER NAME:alwajir s. Nur
PHONE NUMBER 1:09628399428
BARANGAY:tumaga`, f, opts);
  check("receiver name parsed", r.values.delivery_name, "alwajir s. Nur");
  check("it maps to the customer's full name", DELIVERY_TO_CUSTOMER.delivery_name, "full_name");

  // "LAST NAME" outside a delivery block must never become the receiver.
  const owner = [
    { key: "last_name", label: "Last Name", type: "text", required: false, synonyms: [] },
    ...DELIVERY_FIELDS,
  ] as any;
  const r2 = parseTier1(`LAST NAME: Nur
FIRST NAME: Alwajir`, owner, opts);
  check("an owner's name is not a receiver", r2.values.delivery_name, undefined);
  check("the owner's own field still fills", r2.values.last_name, "Nur");
}

console.log("\n[19] A whole address typed into the city box");
{
  // The reported line: a barangay, a municipality written with an initial, and
  // a province, all in the city field. Matching it as one city name finds
  // "City of Zamboanga", which is a different place entirely.
  const issues = placeIssues([
    { group: "birth", cityLabel: "Place of Marriage — City / Municipality",
      provinceLabel: "Place of Marriage — Province",
      city: "casacon roseller Rt lim Zamboanga sibugay", province: "pampanga" },
  ]);
  const city = issues.find((i) => i.label.includes("City"))!;
  check("it reads as the right municipality", city.suggestion, "Roseller Lim");
  check("one button fixes both fields", city.fixes?.[0].label,
    "Roseller Lim, Zamboanga Sibugay");
  check("the patch carries the city", city.fixes?.[0].patch.city, "Roseller Lim");
  check("and the province", city.fixes?.[0].patch.province, "Zamboanga Sibugay");
  check("the message explains what happened", city.message,
    '"casacon roseller Rt lim Zamboanga sibugay" reads as Roseller Lim in Zamboanga Sibugay — the province was written in the city box.');

  // Same shape, from a real paste on file.
  const r2 = resolveCompound("purok 5 bariis matnog sorsogon", "");
  check("purok + barangay + town + province", `${r2?.city}, ${r2?.province}`,
    "Matnog, Sorsogon");

  // A province is required to resolve: without one there is nothing to narrow
  // to, and guessing across 1,634 municipalities would invent answers.
  check("no province, no compound guess",
    resolveCompound("some barangay somewhere", ""), null);
  // A correct pair must not be rewritten.
  check("a correct pair is left alone",
    placeIssues([{ group: "birth", cityLabel: "c", provinceLabel: "p",
      city: "Tulunan", province: "Cotabato" }]).length, 0);
}

console.log("\n[20] The barangay has to be in that city");
{
  check("a real barangay passes", checkBarangay("Mabiga", "Mabalacat City", "Pampanga").status, "ok");
  check("case and spacing ignored", checkBarangay("  tumaga ", "zamboanga", "zamboanga del sur").status, "ok");
  check("a barangay of another town is caught",
    checkBarangay("Bariis", "Mabalacat City", "Pampanga").status, "unknown");
  check("and names the town", checkBarangay("Bariis", "Mabalacat City", "Pampanga").city,
    "Mabalacat City");

  // The reported screenshot: a subdivision and a street in the barangay box,
  // with the real barangay sitting in the city box.
  const b = checkBarangay("San Rafael village kaimito st.", "mabiga mabalacat", "pampanga");
  check("the barangay hiding in the city box is offered", b.suggestion, "Mabiga");
  check("as a suggestion, not a silent pass", b.status, "suggest");

  // Without a city there is nothing to check against, and the city warning is
  // the one to act on first.
  check("no city, no barangay verdict", checkBarangay("Anything", "", "").status, "ok");
  check("an empty barangay is not an error", checkBarangay("", "Matnog", "Sorsogon").status, "ok");

  const issues = placeIssues([
    { group: "delivery", cityLabel: "Delivery city", provinceLabel: "Delivery province",
      barangayLabel: "Delivery barangay",
      city: "mabiga mabalacat", province: "pampanga",
      barangay: "San Rafael village kaimito st." },
  ]);
  check("both halves are reported", issues.length, 2);
  check("the barangay fix patches the barangay",
    issues[1].fixes?.[0].patch.barangay, "Mabiga");
  // Correcting the city on its own would throw away the only evidence of what
  // the barangay was, so the city fix carries it too.
  check("the city fix carries the barangay along",
    JSON.stringify(issues[0].fixes?.[0].patch),
    '{"city":"Mabalacat City","barangay":"Mabiga"}');
  check("and says why", issues[0].message.includes("is its barangay"), true);
  // A complete, correct address must stay silent.
  check("a good address raises nothing", placeIssues([
    { group: "delivery", cityLabel: "c", provinceLabel: "p", barangayLabel: "b",
      city: "Mabalacat City", province: "Pampanga", barangay: "Mabiga" },
  ]).length, 0);
}

console.log("\n[21] A half-written province, when the city already knows it");
{
  const one = (city: string, province: string) =>
    placeIssues([{ group: "birth", cityLabel: "Place of Birth — City",
      provinceLabel: "Place of Birth — Province", city, province }]);

  // The reported case. "tawi" is five letters short of "Tawi-Tawi" — far past
  // any edit distance that would not also confuse real provinces with each
  // other — but Simunul is in exactly one province.
  const t = one("Simunul", "tawi")[0];
  check("the city supplies the province", t.message,
    '"tawi" isn\'t a province — Simunul is in Tawi-Tawi.');
  check("and offers it as the fix", t.fixes?.[0].patch.province, "Tawi-Tawi");

  check("a truncated province resolves too", one("Matnog", "sorso")[0].fixes?.[0].label, "Sorsogon");
  check("so does a bare region word", one("Zamboanga", "zamboanga")[0].fixes?.[0].label,
    "Zamboanga Del Sur");
  // A shared city name narrows to the province the text could be.
  check("the written text narrows a shared name", one("Carmen", "dav")[0].fixes?.[0].label,
    "Davao Del Norte");

  check("a correct pair is still silent", one("Simunul", "tawi-tawi").length, 0);
  check("no province typed is not an error", one("Simunul", "").length, 0);
  // A real province that is simply the wrong one keeps the mismatch wording.
  check("a wrong but real province is a mismatch", one("Simunul", "Sulu")[0].message,
    "Simunul is in Tawi-Tawi, not Sulu.");
  // With no usable city there is nothing to borrow from.
  check("an unknown province with no city help stays unknown",
    one("", "tawi")[0].message, '"tawi" is not a Philippine province.');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
