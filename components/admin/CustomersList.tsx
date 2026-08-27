"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/dates";

export interface CustomerRow {
  id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  province: string | null;
  order_count: number;
  created_at: string;
}

export function CustomersList({ customers }: { customers: CustomerRow[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return customers;
    return customers.filter((c) =>
      `${c.full_name} ${c.phone ?? ""}`.toLowerCase().includes(n)
    );
  }, [customers, q]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search name or phone"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Orders</th>
              <th className="px-4 py-3 font-medium">Since</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-4 py-3">
                  <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                    {c.full_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {[c.city, c.province].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">{c.order_count}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {fmtDate(c.created_at)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
