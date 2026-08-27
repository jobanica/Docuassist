"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, PhoneCall } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { peso } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { aging, attemptBadgeClasses } from "@/lib/status";
import type { OrderStatus, Service, StatusCode } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface OrderRow {
  id: string;
  tracking_code: string;
  status: StatusCode;
  status_label: string;
  total_amount: number;
  created_at: string;
  status_since: string;
  delivery_attempts: number;
  /** 'public' = the customer submitted it themselves through the order link. */
  source: string;
  customer_name: string;
  customer_phone: string | null;
  service_codes: string[];
  service_names: string[];
  /** Reason logged on the most recent failed delivery attempt, if any. */
  last_attempt_note: string | null;
  last_attempt_at: string | null;
}

/**
 * Not a status — a filter for orders a courier failed to deliver and that
 * haven't been returned yet. These are the ones worth phoning: every one
 * recovered before the third attempt is a sale that would otherwise come back.
 */
export const FAILED_ATTEMPTS = "__failed_attempts";

function needsCall(o: OrderRow): boolean {
  return o.status === "shipped" && o.delivery_attempts > 0;
}

const agingClasses: Record<string, string> = {
  none: "",
  warn: "bg-amber-50",
  alert: "bg-red-50",
};

export function OrdersTable({
  orders,
  statuses,
  services,
}: {
  orders: OrderRow[];
  statuses: OrderStatus[];
  services: Service[];
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [service, setService] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const callList = useMemo(() => orders.filter(needsCall), [orders]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = orders.filter((o) => {
      if (status === FAILED_ATTEMPTS) {
        if (!needsCall(o)) return false;
      } else if (status !== "all" && o.status !== status) return false;
      if (service !== "all" && !o.service_codes.includes(service)) return false;
      if (from && o.created_at.slice(0, 10) < from) return false;
      if (to && o.created_at.slice(0, 10) > to) return false;
      if (needle) {
        const hay = `${o.customer_name} ${o.customer_phone ?? ""} ${o.tracking_code}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    // On the call list, urgency decides the order: most attempts first (a 2/3
    // is one failure from being returned), then whoever has gone longest since
    // anyone last tried them — the same date the row shows.
    if (status === FAILED_ATTEMPTS) {
      const since = (o: OrderRow) => o.last_attempt_at ?? o.status_since;
      return [...rows].sort(
        (a, b) =>
          b.delivery_attempts - a.delivery_attempts ||
          since(a).localeCompare(since(b))
      );
    }
    return rows;
  }, [orders, q, status, service, from, to]);

  const onCallList = status === FAILED_ATTEMPTS;

  return (
    <div className="space-y-4">
      {/* Standing reminder so the call list is the first thing seen, without
          having to remember to open the filter. */}
      {callList.length > 0 && !onCallList && (
        <button
          type="button"
          onClick={() => setStatus(FAILED_ATTEMPTS)}
          className="flex w-full items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100"
        >
          <PhoneCall className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <strong>
              {callList.length} order{callList.length === 1 ? "" : "s"} to call
            </strong>{" "}
            — delivery failed and the courier will retry. Reach them before the
            third attempt and it ships again instead of coming back.
          </span>
          <span className="shrink-0 font-medium underline">Show them</span>
        </button>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, or tracking code"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value={FAILED_ATTEMPTS}>
            ⚠ Failed delivery attempts{callList.length ? ` (${callList.length})` : ""}
          </option>
          {statuses.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={service}
          onChange={(e) => setService(e.target.value)}
        >
          <option value="all">All services</option>
          {services.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 text-sm">
          <Input
            type="date"
            className="w-[150px]"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            className="w-[150px]"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {onCallList
          ? `${filtered.length} order${filtered.length === 1 ? "" : "s"} to call, most urgent first`
          : `${filtered.length} of ${orders.length} orders`}
      </p>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">
                {onCallList ? "Why it failed" : "Services"}
              </th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">
                {onCallList ? "Last attempt" : "Created"}
              </th>
              <th className="px-4 py-3 font-medium">Code</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const age = aging(o.status, o.status_since);
              // On the call list, attempts left decide the tint — a 2/3 is
              // urgent even if it only shipped yesterday.
              const tone = onCallList
                ? o.delivery_attempts >= 2
                  ? "bg-red-50"
                  : "bg-amber-50"
                : agingClasses[age];
              return (
                <tr
                  key={o.id}
                  className={cn("border-b last:border-0 hover:bg-accent/40", tone)}
                >
                  <td className="px-4 py-3">
                    <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                      {o.customer_name}
                    </Link>
                    {o.customer_phone ? (
                      // tel: so a tap dials straight from the phone the staff
                      // are most likely holding while working the call list.
                      <a
                        href={`tel:${o.customer_phone.replace(/[^\d+]/g, "")}`}
                        className="block text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {o.customer_phone}
                      </a>
                    ) : (
                      <div className="text-xs text-red-600">no phone on file</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {onCallList
                      ? o.last_attempt_note || "no reason logged"
                      : o.service_names.join(", ")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge code={o.status} label={o.status_label} />
                      {o.source === "public" && (
                        <Badge
                          className="bg-violet-100 text-violet-700"
                          title="Submitted by the customer through your order link"
                        >
                          Online
                        </Badge>
                      )}
                      {o.delivery_attempts > 0 && o.status === "shipped" && (
                        <Badge className={attemptBadgeClasses(o.delivery_attempts)}>
                          Attempt {o.delivery_attempts}/3
                        </Badge>
                      )}
                      {age === "alert" && (
                        <Badge className="bg-red-100 text-red-700">Aging</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{peso(o.total_amount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {onCallList
                      ? fmtDateTime(o.last_attempt_at ?? o.status_since)
                      : fmtDate(o.created_at)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{o.tracking_code}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {onCallList
                  ? "No failed deliveries right now — nothing to chase."
                  : "No orders match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
