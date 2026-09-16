import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase auth session on every request and guards the admin
 * area. Public routes (/track, /login, static assets) are left untouched.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    // The marketing landing page, which is the point of the whole site
    // being public at all — Facebook ad traffic lands here logged out.
    path === "/" ||
    // The generated OG card. Facebook's crawler is not logged in, so left
    // protected this 307s to /login and the ad preview ships with no image.
    path.startsWith("/opengraph-image") ||
    path === "/robots.txt" ||
    path === "/sitemap.xml" ||
    path === "/login" ||
    path.startsWith("/track") ||
    path.startsWith("/api/track") ||
    path.startsWith("/order") ||
    // Linked from the consent tickboxes on the order form. Behind a login
    // they would 307 to /login from a new tab — someone being asked to accept
    // terms they cannot open does not accept them, they leave.
    path === "/terms" ||
    path === "/privacy" ||
    path.startsWith("/api/order") ||
    // The province / city / barangay lists the public order form picks from.
    path.startsWith("/api/psgc") ||
    path.startsWith("/auth");

  // Not signed in and trying to reach a protected page → send to login.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // The layout needs to know which page it is rendering so it can keep a
  // supplier on their own screen. Set here because middleware already has the
  // URL and the layout does not — and because it costs nothing.
  supabaseResponse.headers.set("x-pathname", path);
  return supabaseResponse;
}
