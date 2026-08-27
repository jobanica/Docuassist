/**
 * SMS helper tests (§10). Run with: npm run test:sms
 * Covers PH phone normalization and template token interpolation. No network.
 */
import { normalizePhPhone } from "@/lib/sms/phone";
import { interpolate } from "@/lib/publicCopy";
import { peso } from "@/lib/money";

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); }
}

console.log("\n[1] PH mobile normalization (the forms customers actually type)");
check("09171234567",      normalizePhPhone("09171234567"),      "09171234567");
check("+63 917 123 4567", normalizePhPhone("+63 917 123 4567"), "09171234567");
check("639171234567",     normalizePhPhone("639171234567"),     "09171234567");
check("9171234567",       normalizePhPhone("9171234567"),       "09171234567");
check("0917-123-4567",    normalizePhPhone("0917-123-4567"),    "09171234567");
check("(0917) 123 4567",  normalizePhPhone("(0917) 123 4567"),  "09171234567");

console.log("\n[2] Rejects what isn't a PH mobile");
check("landline 8-digit", normalizePhPhone("87001234"), null);
check("too short",        normalizePhPhone("0917123"),  null);
check("empty",            normalizePhPhone(""),         null);
check("null",             normalizePhPhone(null),       null);
check("letters",          normalizePhPhone("wala po"),  null);
check("08 prefix",        normalizePhPhone("08171234567"), null);

console.log("\n[3] Template interpolation (DB-held templates, §10)");
const ctx = {
  name: "Ana", link: "https://d.ph/track/ABC123",
  total: peso(860), courier: "J&T Express", number: "620999", n: "2",
};
check("shipped template",
  interpolate("Your documents are on the way via {courier}. COD {total}. Track: {link}", ctx),
  "Your documents are on the way via J&T Express. COD ₱860.00. Track: https://d.ph/track/ABC123");
check("failed-attempt template",
  interpolate("Hi {name}, delivery attempt {n}/3 was unsuccessful. Prepare {total} COD. {link}", ctx),
  "Hi Ana, delivery attempt 2/3 was unsuccessful. Prepare ₱860.00 COD. https://d.ph/track/ABC123");

console.log("\n[4] Empty/unknown tokens collapse cleanly");
check("missing courier",
  interpolate("On the way via {courier}! Track: {link}", { ...ctx, courier: "" }),
  "On the way via! Track: https://d.ph/track/ABC123");
check("unknown token -> blank", interpolate("Hello {nope} world", ctx), "Hello world");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
