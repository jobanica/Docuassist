import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *  - _next/static, _next/image (build assets)
     *  - favicon and static media
     *
     * Video belongs on this list as much as images do. Left off it, every
     * testimonial in /public/proof/ answered a 307 to /login instead of
     * bytes — a play button that silently did nothing, which is worse than
     * having no video at all.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mov|m4v|mp3|woff2?)$).*)",
  ],
};
