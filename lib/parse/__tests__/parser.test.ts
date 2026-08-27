/**
 * Tier-1 parser tests (§9). No test runner dependency — run with:
 *   npm run test:parser
 */
import { parseTier1, normalizeDate } from "@/lib/parse/tier1";
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

console.log("\n[4] Wrapped multi-line value");
r = parseTier1(`Full Name: Jose Rizal
Place of Birth: Calamba
Laguna`, fields);
check("wrapped place joined", r.values.place_of_event, "Calamba Laguna");

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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
