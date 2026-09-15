import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — BYPASSES RLS. Server-only.
 *
 * Use with care and only where a trusted server path needs elevated access:
 *   - the public tracking route (calls the whitelisted get_tracking_info RPC),
 *   - the create-staff script.
 * Never import this into a Client Component.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never let Next's data cache answer for a service-role read.
    //
    // The public order page reads its settings through here, and Next was
    // serving them from cache: switching OTP off, closing public orders, or
    // uploading a payment QR left the live page on the old value with no way
    // to tell. Nothing read with this key is a static asset — it is always the
    // current state of the business — so it always goes to the database.
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
