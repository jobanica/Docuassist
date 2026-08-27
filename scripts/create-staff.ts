/**
 * Create (or promote) a staff user for DocuAssist PH.
 *
 * The very first staff account can't be seeded via SQL because the password
 * lives in Supabase Auth. Run this once after applying the migrations:
 *
 *   npm run create-staff -- --email you@example.com --password "secret" \
 *       --name "Juana Dela Cruz" --role admin
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local.
 * The service-role key bypasses RLS — keep it server-side only.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required --${name}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  const email = arg("email");
  const password = arg("password");
  const name = arg("name");
  const role = arg("role", "staff");
  if (role !== "admin" && role !== "staff") {
    throw new Error("--role must be 'admin' or 'staff'");
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Create the auth user (or find the existing one).
  let userId: string;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    if (/already been registered|already exists/i.test(createErr.message)) {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list.users.find((u) => u.email === email);
      if (!existing) throw createErr;
      userId = existing.id;
      console.log(`Auth user already existed: ${email}`);
    } else {
      throw createErr;
    }
  } else {
    userId = created.user.id;
    console.log(`Created auth user: ${email}`);
  }

  // Upsert the staff_users row.
  const { error: upsertErr } = await admin
    .from("staff_users")
    .upsert({ id: userId, name, email, role }, { onConflict: "id" });
  if (upsertErr) throw upsertErr;

  console.log(`✓ Staff ready: ${name} <${email}> (${role})`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
