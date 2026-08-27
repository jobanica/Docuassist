import type { RtsTrendPoint } from "@/lib/sales";

/**
 * RTS rate trend — the health metric for a COD business (§11).
 * A plain bar chart: no chart library, readable at a glance on any screen.
 */
export function RtsTrend({ points }: { points: RtsTrendPoint[] }) {
  const max = Math.max(10, ...points.map((p) => p.rts_rate));

  return (
    <div>
      <div className="flex h-32 items-end gap-2">
        {points.map((p) => {
          const pct = max === 0 ? 0 : (p.rts_rate / max) * 100;
          const tone =
            p.rts_rate >= 20
              ? "bg-red-500"
              : p.rts_rate >= 10
                ? "bg-amber-400"
                : "bg-emerald-500";
          return (
            <div
              key={p.month}
              className="flex flex-1 flex-col items-center justify-end gap-1"
              title={`${p.returned} of ${p.shipped} shipped orders returned`}
            >
              <span className="text-[11px] font-medium text-muted-foreground">
                {p.shipped > 0 ? `${p.rts_rate}%` : "—"}
              </span>
              <div
                className={`w-full rounded-t ${p.shipped > 0 ? tone : "bg-slate-200"}`}
                style={{ height: `${Math.max(pct, 3)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {points.map((p) => (
          <span
            key={p.month}
            className="flex-1 text-center text-[11px] text-muted-foreground"
          >
            {p.month.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}
