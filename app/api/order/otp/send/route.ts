import { NextResponse } from "next/server";
import { sendOtp } from "@/lib/public-order/otp";
import { clientIp } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  let phone = "";
  try {
    ({ phone } = await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const result = await sendOtp(String(phone ?? ""), ip);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      {
        status: 429,
        headers: result.retryAfterSeconds
          ? { "Retry-After": String(result.retryAfterSeconds) }
          : undefined,
      }
    );
  }
  // `stubbed` lets the form tell staff that no SMS key is configured yet,
  // rather than leaving them waiting for a text that will never arrive.
  return NextResponse.json({ ok: true, stubbed: result.stubbed });
}
