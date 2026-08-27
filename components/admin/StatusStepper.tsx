import { Check } from "lucide-react";
import { PIPELINE } from "@/lib/status";
import { fmtDate } from "@/lib/dates";
import type { OrderStatus, StatusCode, OrderStatusHistory } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Admin status stepper. Shows the 6 pipeline stages with the actual date each
 * was reached (from history); the current stage is highlighted. Terminal
 * cancelled/returned states are noted separately by the caller.
 */
export function StatusStepper({
  current,
  statuses,
  history,
}: {
  current: StatusCode;
  statuses: OrderStatus[];
  history: OrderStatusHistory[];
}) {
  const labelOf = (code: StatusCode) =>
    statuses.find((s) => s.code === code)?.label ?? code;

  // First timestamp each status was reached.
  const reachedAt = new Map<string, string>();
  for (const h of history) {
    if (h.status && !reachedAt.has(h.status)) {
      reachedAt.set(h.status, h.created_at);
    }
  }

  const currentIdx = PIPELINE.indexOf(current);
  const isTerminalOff = current === "cancelled" || current === "returned";

  return (
    <ol className="space-y-0">
      {PIPELINE.map((code, i) => {
        const done = !isTerminalOff && i < currentIdx;
        const active = !isTerminalOff && i === currentIdx;
        const date = reachedAt.get(code);
        return (
          <li key={code} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                  done && "border-emerald-500 bg-emerald-500 text-white",
                  active && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                  !done && !active && "border-border bg-muted text-muted-foreground"
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              {i < PIPELINE.length - 1 && (
                <span
                  className={cn(
                    "my-1 w-0.5 flex-1",
                    done ? "bg-emerald-500" : "bg-border"
                  )}
                />
              )}
            </div>
            <div className="pb-6 pt-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  active ? "text-foreground" : done ? "text-foreground/80" : "text-muted-foreground"
                )}
              >
                {labelOf(code)}
              </p>
              {date && (
                <p className="text-xs text-muted-foreground">{fmtDate(date)}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
