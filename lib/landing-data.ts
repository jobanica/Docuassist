import { createClient } from "@supabase/supabase-js";

/**
 * Branding for the landing page header.
 *
 * Read through the public RPC with the anon key, not the service-role client:
 * this is a marketing page and the only values it needs are already public on
 * every tracking link. Deliberately NOT the no-store client used elsewhere —
 * the page is rendered ahead of time and refreshed on its own revalidate
 * window, so a cacheable fetch is the point rather than a bug.
 */
export async function getLandingBranding(): Promise<{
  business_name: string;
  logo_url: string | null;
  logo_includes_name: boolean;
}> {
  const fallback = {
    business_name: "DocuAssist PH",
    logo_url: null,
    logo_includes_name: false,
  };
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        // Cached, but on a leash. Next's data cache keeps a plain fetch
        // indefinitely and across builds — which is how this page ended up
        // rendering an old logo even after a new one was uploaded. A revalidate
        // window keeps the page fast without letting the logo go stale forever.
        global: {
          fetch: (input: RequestInfo | URL, init?: RequestInit) =>
            fetch(input, { ...init, next: { revalidate: 300 } } as RequestInit),
        },
      }
    );
    const { data } = await sb.rpc("get_public_business_info");
    if (!data) return fallback;
    const d = data as Record<string, unknown>;
    return {
      business_name: (d.business_name as string) || fallback.business_name,
      logo_url: (d.logo_url as string) || null,
      logo_includes_name: Boolean(d.logo_includes_name),
    };
  } catch {
    // A marketing page must render even if the database is unreachable.
    return fallback;
  }
}
