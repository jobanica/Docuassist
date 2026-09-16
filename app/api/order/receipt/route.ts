import { NextResponse } from "next/server";
import { uploadReceipt } from "@/lib/public-order/receipt";
import { clientIp } from "@/lib/tracking";

export const dynamic = "force-dynamic";
/** Base64 of an 8MB photo is ~11MB of JSON. */
export const maxDuration = 30;

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const result = await uploadReceipt({
    trackingCode: String(body.trackingCode ?? ""),
    fileName: String(body.fileName ?? "receipt.jpg"),
    mimeType: String(body.mimeType ?? ""),
    data: String(body.data ?? ""),
    ip,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, count: result.count });
}
