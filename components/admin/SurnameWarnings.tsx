"use client";

import { useState } from "react";
import { Users, Copy, Check } from "lucide-react";
import type { SurnameIssue } from "@/lib/parse/surname";

/**
 * The Philippine naming rule, as a warning.
 *
 * Amber, not red, and it never blocks: a legally adopted child, a corrected
 * entry, and a name someone has used their whole life all break the rule
 * legitimately. Staff know those cases; this only makes sure a typo isn't
 * mistaken for one.
 */
export function SurnameWarnings({ issues }: { issues: SurnameIssue[] }) {
  const [copied, setCopied] = useState(false);
  if (issues.length === 0) return null;

  const message = [
    "Hi po! Pa-confirm lang po sa pangalan bago namin i-file sa PSA:",
    "",
    ...issues.map((i) => `• ${i.message}`),
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
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <Users className="h-4 w-4 shrink-0" />
        {issues.length === 1
          ? "The parents' names don't line up"
          : `${issues.length} names don't line up with the parents`}
      </p>
      <ul className="mt-2 space-y-1 text-xs text-amber-900">
        {issues.map((i, n) => (
          <li key={n}>• {i.message}</li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-amber-800">
        In the Philippines a child carries the father&apos;s last name and the
        mother&apos;s maiden last name as their middle name. This is a warning,
        not a block — adoption and corrected entries are real exceptions, so
        save it anyway if you know the names are right.
      </p>
      <button
        type="button"
        onClick={copy}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
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
      </button>
    </div>
  );
}
