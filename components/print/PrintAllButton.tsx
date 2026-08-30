"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintAllButton({ count }: { count: number }) {
  return (
    <Button onClick={() => window.print()} disabled={count === 0}>
      <Printer className="h-4 w-4" />
      Print {count} sheet{count === 1 ? "" : "s"}
    </Button>
  );
}
