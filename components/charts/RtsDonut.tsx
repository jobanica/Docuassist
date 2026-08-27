import { peso } from "@/lib/money";

/**
 * RTS rate as a single headline number in a ring — the one figure that decides
 * whether a COD business is healthy. A hero number, not a pie: there is only
 * one value, so the ring is decoration around the number, and the exact figure
 * is always printed.
 */
export function RtsDonut({
  rate,
  returned,
  shipped,
  lostAmount,
}: {
  rate: number;
  returned: number;
  shipped: number;
  lostAmount: number;
}) {
  const pct = Math.min(100, Math.max(0, rate));
  const tone =
    pct >= 20 ? "#d64545" : pct >= 10 ? "#eda100" : "#1baf7a";

  const R = 54;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="140" height="140" viewBox="0 0 140 140" role="img"
             aria-label={`RTS rate ${pct}%: ${returned} of ${shipped} shipped orders returned`}>
          <circle cx="70" cy="70" r={R} fill="none" stroke="#eef1f6" strokeWidth="16" />
          {/* Omit the arc entirely at 0 — a rounded line-cap still paints a
              dot at zero length, which reads as a tiny stray value. */}
          {pct > 0 && (
            <circle
              cx="70" cy="70" r={R} fill="none" stroke={tone} strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * C} ${C}`}
              transform="rotate(-90 70 70)"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-slate-900">{pct}%</span>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">
            RTS rate
          </span>
        </div>
      </div>

      <dl className="mt-4 w-full space-y-1.5 text-xs">
        <div className="flex justify-between">
          <dt className="text-slate-500">Shipped</dt>
          <dd className="font-medium text-slate-800">{shipped}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Returned</dt>
          <dd className="font-medium text-slate-800">{returned}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Lost to RTS</dt>
          <dd className="font-medium text-red-600">− {peso(lostAmount)}</dd>
        </div>
      </dl>
    </div>
  );
}
