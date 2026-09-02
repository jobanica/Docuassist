import { Check } from "lucide-react";
import { fmtDate, fmtEstimate } from "@/lib/dates";
import type { StatusCode } from "@/lib/types";
import type { PipelineStage, TrackingInfo } from "@/lib/tracking";
import { cn } from "@/lib/utils";

/**
 * Customer-facing vertical stepper (§7). Completed stages show ✓ with the
 * actual date; the current stage is highlighted (animated); future stages are
 * grayed with estimated dates where we have them.
 */
export function PublicStepper({
  pipeline,
  info,
}: {
  pipeline: PipelineStage[];
  info: TrackingInfo;
}) {
  const order = pipeline.map((p) => p.code as StatusCode);
  const currentIdx = order.indexOf(info.status);
  // For cancelled/returned the status isn't in the pipeline; treat prior
  // reached stages as done and none as "current".
  const offPipeline = currentIdx === -1;

  const reachedAt = new Map<string, string>();
  for (const h of info.history) {
    if (h.status && !reachedAt.has(h.status)) reachedAt.set(h.status, h.date);
  }

  const estimateFor = (code: StatusCode): string | null => {
    if (code === "released") return info.expected_release_date;
    if (code === "shipped" || code === "delivered")
      return info.expected_delivery_date;
    return null;
  };

  return (
    <ol>
      {pipeline.map((stage, i) => {
        const code = stage.code as StatusCode;
        const reached = reachedAt.get(code);
        const done = reached != null && (offPipeline || i < currentIdx);
        const active = !offPipeline && i === currentIdx;
        const est = !done && !active ? estimateFor(code) : null;

        return (
          <li key={code} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition",
                  done && "bg-emerald-500 text-white",
                  active &&
                    "bg-[#1e3a5f] text-white ring-4 ring-[#1e3a5f]/15",
                  !done && !active && "bg-slate-100 text-slate-400"
                )}
              >
                {done ? <Check className="h-5 w-5" /> : i + 1}
              </span>
              {i < pipeline.length - 1 && (
                <span
                  className={cn(
                    "my-1 w-0.5 flex-1 rounded-full",
                    done ? "bg-emerald-500" : "bg-slate-200"
                  )}
                />
              )}
            </div>
            <div className="pb-6 pt-1.5">
              <p
                className={cn(
                  "text-[15px]",
                  active
                    ? "font-bold text-[#1e3a5f]"
                    : done
                      ? "font-semibold text-slate-800"
                      : "font-medium text-slate-400"
                )}
              >
                {stage.label}
                {active && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-[#eda100]/20 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-[#8a6100]">
                    Now
                  </span>
                )}
              </p>
              {reached ? (
                <p className="mt-0.5 text-xs text-slate-500">
                  {fmtDate(reached)}
                </p>
              ) : est ? (
                <p className="mt-0.5 text-xs text-slate-400">
                  Expected {fmtEstimate(est)}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
