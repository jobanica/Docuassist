"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** This week / this month / custom range selector for the dashboard (§11). */
export function RangePicker({
  activeKey,
  from,
  to,
}: {
  activeKey: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function go(next: Record<string, string>) {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) q.set(k, v);
    router.push(`/dashboard?${q.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={activeKey === "week" ? "default" : "outline"}
        onClick={() => go({ range: "week" })}
      >
        This week
      </Button>
      <Button
        size="sm"
        variant={activeKey === "month" ? "default" : "outline"}
        onClick={() => go({ range: "month" })}
      >
        This month
      </Button>
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          className="h-9 w-[150px]"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          aria-label="From date"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="date"
          className="h-9 w-[150px]"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          aria-label="To date"
        />
        <Button
          size="sm"
          variant={activeKey === "custom" ? "default" : "outline"}
          onClick={() =>
            go({ range: "custom", from: customFrom, to: customTo })
          }
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
