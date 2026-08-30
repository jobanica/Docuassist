"use client";

import { useState } from "react";
import { MapPinOff, Copy, Check, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlaceIssue, PlaceFix } from "@/lib/parse/places";

/**
 * Cities and provinces that don't check out against the PSA's list.
 *
 * Deliberately a warning, never a block: only the customer knows which San
 * Fernando they meant, and a staff member who knows the area may be right when
 * the list looks wrong. The point is to catch it before a PSA rejection or a
 * returned parcel, both of which cost money.
 */
export function PlaceWarnings({
  issues,
  onFix,
  overridden,
  onOverride,
}: {
  issues: PlaceIssue[];
  /** Apply one of the offered corrections. A patch rather than a value, since
   *  the right fix often touches the city and the province together. */
  onFix?: (issue: PlaceIssue, patch: PlaceFix["patch"]) => void;
  /** Set once staff have deliberately chosen to keep what they wrote. */
  overridden?: boolean;
  onOverride?: (v: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  if (issues.length === 0) return null;

  const message = [
    "Hi po! Pa-confirm lang po bago namin i-process:",
    "",
    ...issues.map((i) =>
      i.kind === "province_mismatch"
        ? `• ${i.label}: ${i.message}`
        : i.suggestion
          ? `• ${i.label}: nakalagay po "${i.input}" — ${i.suggestion} po ba ang tama?`
          : `• ${i.label}: hindi po namin makita ang "${i.input}".`
    ),
    "",
    "Salamat po!",
  ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-red-900">
        <MapPinOff className="h-4 w-4 shrink-0" />
        {issues.length === 1
          ? "This place doesn't exist — fix it before saving"
          : `${issues.length} places don't exist — fix them before saving`}
      </p>
      <ul className="mt-2 space-y-1.5">
        {issues.map((i, n) => {
          // A city name shared by several provinces gets a button each — there
          // is no single right answer, and picking one for staff would just be
          // a guess dressed up as a correction.
          const options = i.fixes ?? [];
          return (
            <li
              key={n}
              className="flex flex-wrap items-center gap-2 text-xs text-red-800"
            >
              <span>
                <span className="font-medium">{i.label}:</span> {i.message}
              </span>
              {onFix &&
                options.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => onFix(i, f.patch)}
                    className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-0.5 text-[11px] font-medium text-red-800 hover:bg-red-100"
                  >
                    <Wand2 className="h-3 w-3" /> Use &ldquo;{f.label}&rdquo;
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-red-700">
        A wrong city gets a PSA request rejected or a parcel returned, so this
        blocks saving. Fix it, or confirm with the customer first.
      </p>
      {onOverride && (
        <label className="mt-2 flex items-start gap-2 rounded-md bg-white p-2 text-[11px] text-red-800">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            checked={Boolean(overridden)}
            onChange={(e) => onOverride(e.target.checked)}
          />
          <span>
            Keep what the customer wrote — I&apos;ve checked and it&apos;s
            right. Use this only when you know the place; the list is the PSA&apos;s
            own and is rarely wrong.
          </span>
        </label>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2 border-red-300 bg-white hover:bg-red-100"
        onClick={copy}
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" /> Copied — paste in Messenger
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" /> Copy message for the customer
          </>
        )}
      </Button>
    </div>
  );
}
