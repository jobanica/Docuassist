"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { peso } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (service !== "all" && !o.service_codes.includes(service)) return false;
      if (from && o.created_at.slice(0, 10) < from) return false;
      if (to && o.created_at.slice(0, 10) > to) return false;
      if (needle) {
        const hay = `${o.customer_name} ${o.customer_phone ?? ""} ${o.tracking_code}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [orders, q, status, service, from, to]);

  return (
    <div className="space-y-4">
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
        {filtered.length} of {orders.length} orders
      </p>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Services</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Code</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const age = aging(o.status, o.status_since);
              return (
                <tr
                  key={o.id}
                  className={cn("border-b last:border-0 hover:bg-accent/40", agingClasses[age])}
                >
                  <td className="px-4 py-3">
                    <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                      {o.customer_name}
                    </Link>
                    {o.customer_phone && (
                      <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {o.service_names.join(", ")}
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
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(o.created_at)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{o.tracking_code}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No orders match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
