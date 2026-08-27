/**
 * Seed realistic demo orders so the dashboard, charts and tracking pages have
 * something to show while you're evaluating the app.
 *
 *   npm run seed:demo           # insert demo customers + orders
 *   npm run seed:demo -- --clear  # remove them again
 *
 * Every demo customer is tagged in `notes` with DEMO_TAG, and --clear deletes
 * exactly those customers and their orders — so this never touches real data
 * you've encoded yourself.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). Server-side only.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const DEMO_TAG = "[demo-data]";

const FIRST = [
  "Maria", "Jose", "Ana", "Juan", "Rosa", "Pedro", "Liza", "Carlo",
  "Grace", "Miguel", "Divina", "Ramon", "Jenny", "Noel", "Cristina", "Arnel",
];
const LAST = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Villanueva", "Mendoza",
  "Aquino", "Del Rosario", "Ramos", "Gonzales", "Torres",
];
const PLACES = [
  { city: "Quezon City", province: "Metro Manila", zip: "1100", brgy: "Barangay Holy Spirit" },
  { city: "Cebu City", province: "Cebu", zip: "6000", brgy: "Barangay Lahug" },
  { city: "Davao City", province: "Davao del Sur", zip: "8000", brgy: "Barangay Buhangin" },
  { city: "Iloilo City", province: "Iloilo", zip: "5000", brgy: "Barangay Jaro" },
  { city: "Cagayan de Oro", province: "Misamis Oriental", zip: "9000", brgy: "Barangay Carmen" },
  { city: "Baguio", province: "Benguet", zip: "2600", brgy: "Barangay Camp 7" },
];
const PURPOSES = ["Passport application", "Employment abroad", "School requirement",
  "Marriage license", "SSS claim", "Bank requirement"];
const FAIL_REASONS = ["No one home", "Customer unreachable", "Wrong address",
  "No cash for COD", "Rescheduled by customer"];

// Deterministic PRNG so re-running gives the same shaped dataset.
let seed = 20260827;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function clear() {
  const db = admin();
  const { data: demo } = await db
    .from("customers")
    .select("id")
    .like("notes", `%${DEMO_TAG}%`);
  const ids = (demo ?? []).map((c) => c.id);
  if (!ids.length) {
    console.log("No demo data found — nothing to clear.");
    return;
  }
  const { data: orders } = await db.from("orders").select("id").in("customer_id", ids);
  const orderIds = (orders ?? []).map((o) => o.id);

  if (orderIds.length) {
    await db.from("order_status_history").delete().in("order_id", orderIds);
    await db.from("order_items").delete().in("order_id", orderIds);
    await db.from("notifications_log").delete().in("order_id", orderIds);
    await db.from("orders").delete().in("id", orderIds);
  }
  await db.from("customers").delete().in("id", ids);
  console.log(`Cleared ${ids.length} demo customers and ${orderIds.length} demo orders.`);
}

async function seed_() {
  const db = admin();

  const [{ data: services }, { data: couriers }, { data: staff }] = await Promise.all([
    db.from("services").select("id, code, name, price, form_fields").eq("active", true),
    db.from("couriers").select("id, name").eq("active", true),
    db.from("staff_users").select("id").limit(1),
  ]);
  if (!services?.length) throw new Error("No active services — apply the migrations first.");
  if (!couriers?.length) throw new Error("No active couriers — apply the migrations first.");
  const staffId = staff?.[0]?.id ?? null;

  // Shape: mostly delivered, a healthy tail of in-flight work, a few returns
  // and one cancellation — so every dashboard panel has something in it.
  const PLAN: { status: string; count: number }[] = [
    { status: "delivered", count: 16 },
    { status: "shipped", count: 5 },
    { status: "processing", count: 4 },
    { status: "released", count: 2 },
    { status: "details_received", count: 2 },
    { status: "new_inquiry", count: 2 },
    { status: "returned", count: 3 },
    { status: "cancelled", count: 1 },
  ];

  let made = 0;
  for (const { status, count } of PLAN) {
    for (let i = 0; i < count; i++) {
      const place = pick(PLACES);
      const first = pick(FIRST);
      const last = pick(LAST);
      // Spread across ~6 months so the monthly chart has shape.
      const age = int(2, 175);

      const { data: cust, error: cErr } = await db
        .from("customers")
        .insert({
          full_name: `${first} ${last}`,
          phone: `09${int(10, 99)}${String(int(1000000, 9999999))}`,
          messenger_name: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, "")}`,
          address_line: `${int(1, 99)} ${pick(["Rizal", "Mabini", "Bonifacio", "Luna", "Del Pilar"])} Street`,
          barangay: place.brgy,
          city: place.city,
          province: place.province,
          zip: place.zip,
          notes: DEMO_TAG,
          created_at: daysAgo(age + 1),
        })
        .select("id")
        .single();
      if (cErr) throw new Error(cErr.message);

      const svc = pick(services);
      const courier = pick(couriers);
      const shipped = ["shipped", "delivered", "returned"].includes(status);
      // Deterministic rather than random: guarantee the first two shipped
      // orders carry 2 and 1 failed attempts, so the 1/3 · 2/3 badges and the
      // escalating warning on the public page are actually demonstrable.
      const attempts =
        status === "returned" ? 3 : status === "shipped" ? [2, 1, 0, 0, 0][i] ?? 0 : 0;

      const { data: order, error: oErr } = await db
        .from("orders")
        .insert({
          customer_id: cust.id,
          status,
          created_at: daysAgo(age),
          courier_id: shipped ? courier.id : null,
          courier_tracking_number: shipped ? `${int(600, 699)}${int(100000000, 999999999)}` : null,
          shipped_at: shipped ? daysAgo(Math.max(1, age - 14)) : null,
          delivered_at: status === "delivered" ? daysAgo(Math.max(0, age - 20)) : null,
          returned_at: status === "returned" ? daysAgo(Math.max(0, age - 25)) : null,
          cancelled_at: status === "cancelled" ? daysAgo(Math.max(0, age - 3)) : null,
          cancel_reason: status === "cancelled" ? "Customer changed their mind" : null,
          return_reason: status === "returned"
            ? `3 failed attempts — ${pick(FAIL_REASONS).toLowerCase()}`
            : null,
          delivery_attempts: attempts,
          // Nearly all delivered orders are paid; leave one or two uncollected
          // so the COD gap on the dashboard is visible.
          payment_status: status === "delivered" && rnd() < 0.9 ? "paid" : "unpaid",
          expected_release_date: daysAgo(Math.max(0, age - 14)).slice(0, 10),
          expected_delivery_date: daysAgo(Math.max(0, age - 21)).slice(0, 10),
        })
        .select("id, tracking_code")
        .single();
      if (oErr) throw new Error(oErr.message);

      // Fill the service's own form fields so order detail looks real.
      const details: Record<string, string> = {};
      for (const f of (svc.form_fields ?? []) as { key: string; type: string }[]) {
        if (f.type === "date") details[f.key] = daysAgo(int(6000, 15000)).slice(0, 10);
        else if (f.type === "number") details[f.key] = String(int(1, 3));
        else if (f.key.includes("purpose")) details[f.key] = pick(PURPOSES);
        else if (f.key.includes("place")) details[f.key] = place.city;
        else if (f.key.includes("mother")) details[f.key] = `${pick(FIRST)} ${pick(LAST)}`;
        else if (f.key.includes("father")) details[f.key] = `${pick(FIRST)} ${pick(LAST)}`;
        else details[f.key] = `${first} ${last}`;
      }
      await db.from("order_items").insert({
        order_id: order.id,
        service_id: svc.id,
        quantity: rnd() < 0.15 ? 2 : 1,
        price_at_order: svc.price,
        form_details: details,
      });

      // Status history, so the public tracking stepper renders properly.
      const flow = ["new_inquiry", "details_received", "processing", "released", "shipped", "delivered"];
      const upto = flow.indexOf(status);
      const rows: Record<string, unknown>[] = [];
      for (let s = 0; s <= (upto === -1 ? 4 : upto); s++) {
        rows.push({
          order_id: order.id,
          status: flow[s],
          event_type: "status_change",
          changed_by: staffId,
          created_at: daysAgo(Math.max(0, age - s * 4)),
        });
      }
      for (let a = 1; a <= attempts; a++) {
        rows.push({
          order_id: order.id,
          status: null,
          event_type: "failed_attempt",
          attempt_number: a,
          note: pick(FAIL_REASONS),
          changed_by: staffId,
          created_at: daysAgo(Math.max(0, age - 16 - a)),
        });
      }
      if (status === "returned" || status === "cancelled") {
        rows.push({
          order_id: order.id,
          status,
          event_type: "status_change",
          note: status === "returned" ? "Parcel returned to sender" : "Customer changed their mind",
          changed_by: staffId,
          created_at: daysAgo(Math.max(0, age - 25)),
        });
      }
      await db.from("order_status_history").insert(rows);

      made++;
      if (made === 1 || made % 10 === 0) {
        console.log(`  ${made} orders…  (sample tracking code: ${order.tracking_code})`);
      }
    }
  }
  console.log(`\n✓ Seeded ${made} demo orders. Remove them any time with:`);
  console.log("    npm run seed:demo -- --clear");
}

const main = process.argv.includes("--clear") ? clear : seed_;
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
