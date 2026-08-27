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
  });
}
