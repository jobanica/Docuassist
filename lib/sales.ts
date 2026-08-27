import { createClient } from "@/lib/supabase/server";

export interface SalesSummary {
  booked_amount: number;
  booked_count: number;
  collected_amount: number;
  collected_count: number;
  rts_amount: number;
  rts_count: number;
  cancelled_amount: number;
  cancelled_count: number;
  net_amount: number;
  shipped_count: number;
  shipped_returned_count: number;
  rts_rate: number;
}

export interface RtsTrendPoint {
  month: string;
  shipped: number;
  returned: number;
  rts_rate: number;
}

export interface ServiceBreakdown {
  service_name: string;
  booked_amount: number;
  booked_count: number;
  collected_amount: number;
  rts_amount: number;
  rts_count: number;
}

export interface CourierBreakdown {
  courier_name: string;
  shipped_count: number;
  returned_count: number;
  rts_amount: number;
  rts_rate: number;
}

export interface ReturnedOrderRow {
  order_id: string;
  tracking_code: string;
  customer_name: string;
  city: string | null;
  courier_name: string | null;
  total_amount: number;
  delivery_attempts: number;
  return_reason: string | null;
  returned_at: string;
}

/** Named ranges offered on the dashboard, plus a custom range. */
export type RangeKey = "week" | "month" | "custom";

/** Resolve a range key to ISO dates in Asia/Manila terms. */
export function resolveRange(
  key: string | undefined,
  from?: string,
  to?: string
): { from: string; to: string; key: RangeKey } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (key === "custom" && from && to) {
    return { from, to, key: "custom" };
  }
  if (key === "week") {
    // Monday-start week containing today.
    const day = (today.getUTCDay() + 6) % 7;
    const monday = new Date(today.getTime() - day * 86_400_000);
    return { from: iso(monday), to: iso(today), key: "week" };
  }
  // Default: this month.
  const first = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
  );
  return { from: iso(first), to: iso(today), key: "month" };
}

/**
 * Load every §11 figure. All values are computed by query from order data —
 * there are no stored running totals, so the dashboard can never drift out of
 * sync with the orders themselves.
 */
export async function loadSales(from: string, to: string) {
  const supabase = createClient();
  const [summary, trend, byService, byCourier, returned] = await Promise.all([
    supabase.rpc("sales_summary", { p_from: from, p_to: to }),
    supabase.rpc("sales_rts_trend", { p_months: 6 }),
    supabase.rpc("sales_by_service", { p_from: from, p_to: to }),
    supabase.rpc("sales_by_courier", { p_from: from, p_to: to }),
    supabase.rpc("returned_orders", { p_from: from, p_to: to }),
  ]);

  return {
    summary: (summary.data ?? null) as SalesSummary | null,
    trend: (trend.data ?? []) as RtsTrendPoint[],
    byService: (byService.data ?? []) as ServiceBreakdown[],
    byCourier: (byCourier.data ?? []) as CourierBreakdown[],
    returned: (returned.data ?? []) as ReturnedOrderRow[],
  };
}
