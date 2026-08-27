"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { parseTier1 } from "@/lib/parse/tier1";
import { parseTier2 } from "@/lib/parse/tier2";
import type { FormFieldDef } from "@/lib/types";

export interface ParseResult {
  /** field key -> value, for pre-filling the editable form */
  values: Record<string, string>;
  /** keys the parser filled — highlighted in the form for staff review */
  filledKeys: string[];
  /** required keys still empty — flagged so staff knows what to check */
  missingRequired: string[];
  /** which tier produced the final result (2 means the AI fallback ran) */
  tier: 1 | 2;
  /** true when Tier-2 was needed but unavailable/failed */
  aiUnavailable: boolean;
}

const MAX_PASTE_CHARS = 8000;

/**
 * Paste & Parse (§9). Tier 1 (rule-based) always runs first; Tier 2 (Anthropic)
 * runs only if required fields are still empty. Values are returned to the
 * client for review — this action NEVER writes them to the database.
 */
export async function parsePastedText(
  text: string,
  serviceId: string
): Promise<ParseResult> {
  await requireStaff();

  const trimmed = text.trim();
  if (!trimmed) {
    return {
      values: {},
      filledKeys: [],
      missingRequired: [],
      tier: 1,
      aiUnavailable: false,
    };
  }
  // Bound what we ever send to the API / process.
  const input = trimmed.slice(0, MAX_PASTE_CHARS);

  const supabase = createClient();
  const { data: service, error } = await supabase
    .from("services")
    .select("code, form_fields")
    .eq("id", serviceId)
    .single();
  if (error) throw new Error(error.message);

  const fields = (service.form_fields ?? []) as FormFieldDef[];

  // --- Tier 1: free, instant, deterministic ---
  const t1 = parseTier1(input, fields);
  let values = { ...t1.values };
  let filledKeys = [...t1.filledKeys];
  let tier: 1 | 2 = 1;
  let aiUnavailable = false;
  let tokensIn = 0;
  let tokensOut = 0;

  // --- Tier 2: only when Tier 1 left required fields empty ---
  if (t1.missingRequired.length > 0) {
    const t2 = await parseTier2(input, fields);
    if (t2) {
      tier = 2;
      tokensIn = t2.tokensIn;
      tokensOut = t2.tokensOut;
      // Tier 1 wins on conflict — deterministic labels beat inference.
      for (const [k, v] of Object.entries(t2.values)) {
        if (!values[k]) {
          values[k] = v;
          filledKeys.push(k);
        }
      }
    } else {
      aiUnavailable = true;
    }
  }

  const missingRequired = fields
    .filter((f) => f.required && !values[f.key])
    .map((f) => f.key);

  // Cost visibility (§9). Never blocks the parse.
  try {
    await supabase.from("parse_logs").insert({
      order_id: null, // still a draft — no order exists yet
      service_code: service.code,
      tier,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    });
  } catch {
    /* logging is best-effort */
  }

  return { values, filledKeys, missingRequired, tier, aiUnavailable };
}
