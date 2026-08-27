"use client";

import { useState, useTransition } from "react";
import { ClipboardPaste, Sparkles, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { parsePastedText, type ParseResult } from "@/lib/actions/parse";
import type { Service } from "@/lib/types";

/**
 * Paste & Parse (§9). Staff pastes the customer's Messenger reply, picks which
 * service the details belong to, and the fields below auto-fill for review.
 * Parsed values are NEVER auto-saved — staff confirms before creating the order.
 */
export function PasteParseBox({
  services,
  onParsed,
}: {
  /** Services currently selected on the form — the parse targets one of them. */
  services: Service[];
  onParsed: (serviceId: string, result: ParseResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [targetId, setTargetId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ParseResult | null>(null);

  const effectiveTarget = targetId || services[0]?.id || "";
  const targetService = services.find((s) => s.id === effectiveTarget);

  function run() {
    setError(null);
    setSummary(null);
    if (!effectiveTarget) {
      setError("Pick a service below first, then parse.");
      return;
    }
    if (!text.trim()) {
      setError("Paste the customer's message first.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await parsePastedText(text, effectiveTarget);
        setSummary(result);
        onParsed(effectiveTarget, result);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not parse that message."
        );
      }
    });
  }

  if (!open) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between py-4">
          <div className="text-sm">
            <p className="font-medium">📋 Paste &amp; Parse</p>
            <p className="text-muted-foreground">
              Copy the customer&apos;s reply from Messenger and auto-fill the
              form below.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <ClipboardPaste className="h-4 w-4" /> Open
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">📋 Paste &amp; Parse</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "Paste the whole reply here, e.g.\n\nFull Name: Juan Dela Cruz\nBirthdate: Jan 5, 1990\nLugar ng kapanganakan: Quezon City\nPangalan ng ina: Maria Santos"
          }
          className="font-mono text-xs"
        />

        <div className="flex flex-wrap items-center gap-2">
          {services.length > 1 && (
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={effectiveTarget}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  Fill: {s.name}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" onClick={run} disabled={pending}>
            <Sparkles className="h-4 w-4" />
            {pending ? "Parsing…" : "Parse"}
          </Button>
          {services.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Select a service below first.
            </span>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {summary && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              {summary.filledKeys.length > 0
                ? `Filled ${summary.filledKeys.length} field${
                    summary.filledKeys.length === 1 ? "" : "s"
                  } on ${targetService?.name ?? "the form"}`
                : "No fields could be read from that message"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {summary.tier === 2
                  ? "· AI fallback used"
                  : "· rule-based, no API cost"}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Highlighted fields below were auto-filled.{" "}
              <strong>Please double-check them before saving</strong> — wrong
              details get the PSA request rejected.
            </p>
            {summary.missingRequired.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {summary.missingRequired.length} required field
                {summary.missingRequired.length === 1 ? " is" : "s are"} still
                empty — fill {summary.missingRequired.length === 1 ? "it" : "them"}{" "}
                in manually.
              </p>
            )}
            {summary.aiUnavailable && (
              <p className="mt-1 text-xs text-muted-foreground">
                AI fallback unavailable (no API key or the call failed) — only
                the rule-based parser ran.
              </p>
            )}
            {summary.filledKeys.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Nothing matched. Your paste stays above — copy values across
                manually into the blank form.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
