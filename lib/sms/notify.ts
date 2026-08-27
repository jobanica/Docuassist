import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms, type SmsEvent, type SmsOutcome } from "./semaphore";

/**
 * Load an order's SMS context and send the event's message (§10).
 * Fire-and-forget: never throws, so a failed SMS can't roll back the order
 * operation that triggered it.
 */
export async function notifyOrder(
  event: SmsEvent,
  orderId: string,
  extra?: { attempt?: number }
): Promise<SmsOutcome> {
  try {
    // Same reasoning as sendSms: the public order form triggers this with no
    // staff session, so the order lookup must not depend on one.
    const supabase = createAdminClient();
    const { data: order } = await supabase
      .from("orders")
      .select(
        `tracking_code, total_amount, courier_tracking_number,
         customers ( full_name, phone ),
         couriers ( name )`
      )
      .eq("id", orderId)
      .maybeSingle();

    if (!order) return "skipped";

    const o = order as any;
    const cust = Array.isArray(o.customers) ? o.customers[0] : o.customers;
    const courier = Array.isArray(o.couriers) ? o.couriers[0] : o.couriers;

    return await sendSms(event, {
      orderId,
      name: cust?.full_name ? String(cust.full_name).split(" ")[0] : null,
      phone: cust?.phone ?? null,
      trackingCode: o.tracking_code,
      totalAmount: Number(o.total_amount),
      courierName: courier?.name ?? null,
      trackingNumber: o.courier_tracking_number ?? null,
      attempt: extra?.attempt ?? null,
    });
  } catch {
    return "failed";
  }
}
