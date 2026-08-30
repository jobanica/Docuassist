"use client";

import { useState } from "react";
import { MapPinOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlaceIssue } from "@/lib/parse/places";

/**
 * Cities and provinces that don't check out against the PSA's list.
 *
 * Deliberately a warning, never a block: only the customer knows which San
 * Fernando they meant, and a staff member who knows the area may be right when
 * the list looks wrong. The point is to catch it before a PSA rejection or a
 * returned parcel, both of which cost money.
 */
export function PlaceWarnings({ issues }: { issues: PlaceIssue[] }) {
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
          ? "Check this address with the customer"
          : `Check ${issues.length} details with the customer`}
      </p>
      <ul className="mt-2 space-y-1">
        {issues.map((i, n) => (
          <li key={n} className="text-xs text-red-800">
            <span className="font-medium">{i.label}:</span> {i.message}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-red-700">
        A wrong city gets a PSA request rejected or a parcel returned. Confirm
        before processing — or keep what they wrote if you know it&apos;s right.
      </p>
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
