"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FAQ } from "@/lib/landing";

/**
 * The objections, answered where they are asked.
 *
 * Native <details> would be lighter, but the arrow and the open/closed state
 * are styled here, and one-at-a-time makes a seven-item list readable on a
 * phone instead of a wall of text.
 */
export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {FAQ.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <h3>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50"
              >
                <span className="text-[15px] font-semibold text-[#14406F]">
                  {item.q}
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </h3>
            <div
              id={`faq-panel-${i}`}
              hidden={!isOpen}
              className="px-5 pb-5 text-[15px] leading-relaxed text-slate-600"
            >
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
