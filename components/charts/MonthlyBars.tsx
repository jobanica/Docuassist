"use client";

import { useState } from "react";
import { peso } from "@/lib/money";

export interface MonthPoint {
  month: string;
  label: string;
  booked: number;
  collected: number;
}

/**
 * Booked vs Collected by month. Two categorical series (blue / amber) —
 * validated for CVD separation (ΔE 31.5). Amber falls below 3:1 against the
 * card surface, so the legend and the hover tooltip carry visible labels
 * rather than relying on colour alone.
 */
export function MonthlyBars({ data }: { data: MonthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => [d.booked, d.collected]));
  // Round the axis up to something human.
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;

  return (
    <div>
      {/* Legend — always present for 2+ series */}
      <div className="mb-4 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#2a78d6]" /> Booked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#eda100]" /> Collected
        </span>
      </div>

      <div className="relative flex gap-3">
        {/* y axis */}
        <div className="flex w-12 shrink-0 flex-col justify-between py-0.5 text-right text-[10px] text-slate-400">
          {[top, top * 0.75, top * 0.5, top * 0.25, 0].map((v) => (
            <span key={v}>{v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}</span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* recessive gridlines */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="border-t border-slate-100" />
            ))}
          </div>

          <div className="relative flex h-44 items-end justify-around gap-2">
            {data.map((d, i) => (
              <div
                key={d.month}
                className="group relative flex h-full flex-1 items-end justify-center gap-[2px]"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className="w-1/3 rounded-t bg-[#2a78d6] transition-opacity"
                  style={{ height: `${Math.max((d.booked / top) * 100, d.booked > 0 ? 2 : 0)}%` }}
                />
                <div
                  className="w-1/3 rounded-t bg-[#eda100] transition-opacity"
                  style={{ height: `${Math.max((d.collected / top) * 100, d.collected > 0 ? 2 : 0)}%` }}
                />
                {hover === i && (d.booked > 0 || d.collected > 0) && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-2 w-max rounded-lg bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg">
                    <p className="font-medium">{d.label}</p>
                    <p className="text-white/80">Booked: {peso(d.booked)}</p>
                    <p className="text-white/80">Collected: {peso(d.collected)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* x axis */}
          <div className="mt-2 flex justify-around gap-2">
            {data.map((d) => (
              <span key={d.month} className="flex-1 text-center text-[11px] text-slate-500">
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
