import { NextResponse } from "next/server";
import { lookupTracking, clientIp } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * Public tracking lookup. The ONLY data returned is the whitelisted output of
 * the get_tracking_info RPC (§13) — never a raw table read. Rate-limited per IP.
 */
export async function GET(
  request: Request,
  { params }: { params: { code: string } }
) {
  const ip = clientIp(request.headers);
  const code = params.code?.trim() ?? "";

  if (!code) {
    return NextResponse.json({ error: "missing_code" }, { status: 400 });
  }

  const result = await lookupTracking(code, ip);

  if (result.kind === "rate_limited") {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  if (result.kind === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
