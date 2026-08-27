import { NextResponse } from "next/server";
import { verifyOtp } from "@/lib/public-order/otp";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let phone = "";
  let code = "";
  try {
    ({ phone, code } = await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const result = await verifyOtp(String(phone ?? ""), String(code ?? ""));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, token: result.token });
}
