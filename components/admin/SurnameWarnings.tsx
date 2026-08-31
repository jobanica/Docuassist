"use client";

import { useState } from "react";
import { Users, Copy, Check, ShieldCheck, Undo2, Loader2, AlertCircle } from "lucide-react";
import { NAME_CHECK_REASONS, type SurnameIssue } from "@/lib/parse/surname";
import { fmtDate } from "@/lib/dates";

/** The escape hatch on the reason list, when none of the presets fit. */
const OTHER = "Another reason";

/**
 * The Philippine naming rule, as a warning.
 *
 * Amber, not red, and it never blocks: a legally adopted child, a corrected
 * entry, and a name someone has used their whole life all break the rule
 * legitimately. Staff know those cases; this only makes sure a typo isn't
 * mistaken for one.
 *
 * When they do know, they can say so. An accepted warning collapses to a line
 * saying who accepted it and why, and stops counting on the orders board — the
 * point of the board listing these is to work through the ones nobody has
 * looked at yet.
 */
export function SurnameWarnings({
  issues,
  accepted = null,
  onAccept,
  onUndo,
  busy = false,
  error = null,
}: {
  issues: SurnameIssue[];
  /** A standing acceptance for exactly these names, if there is one. */
  accepted?: { reason: string; at?: string | null; by?: string | null } | null;
  /** Omit to leave the warning read-only — the customer's own order form. */
  onAccept?: (reason: string) => void;
  onUndo?: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState(NAME_CHECK_REASONS[0]);
  const [other, setOther] = useState("");

  // An acceptance is worth showing even when the names now agree with the
  // rule: it says the office looked. Everything else needs an open issue.
  if (issues.length === 0 && !accepted) return null;

  if (accepted) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          Name check accepted
        </p>
        <p className="mt-1 text-xs text-slate-700">{accepted.reason}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          {accepted.by ? `${accepted.by} · ` : ""}
          {accepted.at ? fmtDate(accepted.at) : ""}
          {accepted.at || accepted.by ? " · " : ""}
          Edit any of the names and the check runs again.
        </p>
        {onUndo && (
          <button
            type="button"
            disabled={busy}
            onClick={onUndo}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Undo2 className="h-3.5 w-3.5" />
            )}
            Undo
          </button>
        )}
        {error && <Err msg={error} />}
      </div>
    );
  }

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

  const reason = choice === OTHER ? other.trim() : choice;

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
        not a block — unmarried parents, adoption and corrected entries are real
        exceptions, so save it anyway if you know the names are right.
      </p>

      {!picking && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
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
          {onAccept && (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> The names are right
            </button>
          )}
        </div>
      )}

      {picking && onAccept && (
        <div className="mt-2 rounded-md border border-amber-300 bg-white p-2.5">
          <p className="text-xs font-semibold text-amber-900">
            Why are the names right?
          </p>
          <div className="mt-1.5 space-y-1">
            {[...NAME_CHECK_REASONS, OTHER].map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-start gap-2 text-xs text-slate-700"
              >
                <input
                  type="radio"
                  name="name-check-reason"
                  className="mt-0.5"
                  checked={choice === r}
                  onChange={() => setChoice(r)}
                />
                <span>{r}</span>
              </label>
            ))}
          </div>
          {choice === OTHER && (
            <input
              type="text"
              maxLength={200}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="e.g. The PSA copy the customer sent reads this way."
              className="mt-1.5 w-full rounded-md border px-2 py-1.5 text-xs"
            />
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            This is kept on the order and clears the warning from the orders
            board. Change any of the names later and it comes back.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !reason}
              onClick={() => {
                onAccept(reason);
                setPicking(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              Accept the warning
            </button>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="rounded-md px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <Err msg={error} />}
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {msg}
    </p>
  );
}
