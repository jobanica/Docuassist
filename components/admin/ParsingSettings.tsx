"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, ShieldAlert, Info, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toMessage, unwrap } from "@/lib/action-result";
import { updateParsingSettings } from "@/lib/actions/settings";

/**
 * Auto-fill settings. Two switches because they have different costs: the
 * rule-based pass is free, the AI fallback is billed per parse.
 */
export function ParsingSettings({
  initial,
  canEdit,
  aiKeyConfigured,
}: {
  initial: { parsing_enabled: boolean; parsing_ai_enabled: boolean };
  canEdit: boolean;
  aiKeyConfigured: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await updateParsingSettings(v));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Only admins can change these. You can view them here.
        </p>
      )}

      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        <p className="flex items-center gap-2 font-medium text-slate-900">
          <Wand2 className="h-4 w-4" /> How it works
        </p>
        <p className="mt-1 text-xs text-slate-500">
          On an order, the customer&apos;s pasted reply sits directly above the
          PSA form fields. With auto-fill on, an <strong>Auto-fill</strong>{" "}
          button reads that paste and fills the fields for you. Nothing is
          saved until you press Save — the values land in the boxes for you to
          check first, because a wrong detail gets the PSA application
          rejected.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block font-medium text-slate-900">
              Auto-fill the PSA form fields
            </span>
            <span className="block text-xs text-slate-500">
              Reads labelled lines out of the pasted reply — &ldquo;Full Name:
              …&rdquo;, &ldquo;Birthdate: …&rdquo;, &ldquo;Pangalan ng ina:
              …&rdquo; — and fills what it recognises. Rule-based, instant, and
              free: no API, no per-use cost.
            </span>
          </span>
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0"
            disabled={!canEdit}
            checked={v.parsing_enabled}
            onChange={(e) =>
              setV({ ...v, parsing_enabled: e.target.checked })
            }
          />
        </label>

        <label
          className={`flex items-start justify-between gap-4 border-t pt-4 ${
            v.parsing_enabled ? "" : "opacity-50"
          }`}
        >
          <span>
            <span className="block font-medium text-slate-900">
              Use AI when the rules can&apos;t read it
            </span>
            <span className="block text-xs text-slate-500">
              For replies that aren&apos;t in the usual &ldquo;Label: value&rdquo;
              shape. Runs only when required fields are still empty after the
              free pass, and <strong>costs a fraction of a peso per parse</strong>{" "}
              on your own Anthropic API key.
            </span>
          </span>
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0"
            disabled={!canEdit || !v.parsing_enabled}
            checked={v.parsing_ai_enabled}
            onChange={(e) =>
              setV({ ...v, parsing_ai_enabled: e.target.checked })
            }
          />
        </label>

        {v.parsing_enabled && v.parsing_ai_enabled && !aiKeyConfigured && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>No API key set.</strong> ANTHROPIC_API_KEY isn&apos;t
              configured, so the AI step is skipped and only the free
              rule-based pass runs. Auto-fill still works — it just reads less.
            </span>
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {canEdit && (
          <Button onClick={save} disabled={!dirty || pending}>
            <Save className="h-4 w-4" />
            {saved ? "Saved!" : pending ? "Saving…" : "Save changes"}
          </Button>
        )}
      </div>
    </div>
  );
}
