"use server";

import { run, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { expandNameGroups, parseTier1 } from "@/lib/parse/tier1";
import { placeIssues, type PlaceIssue } from "@/lib/parse/places";
import {
  DELIVERY_FIELDS,
  DELIVERY_ONLY_IN_BLOCK,
  DELIVERY_TO_CUSTOMER,
  NEVER_IN_DELIVERY_BLOCK,
} from "@/lib/parse/delivery";
import { parseTier2 } from "@/lib/parse/tier2";
import type { FormFieldDef } from "@/lib/types";

export interface ParseResult {
  /** field key -> value, for pre-filling the editable form */
  values: Record<string, string>;
  /** keys the parser filled — highlighted in the form for staff review */
  filledKeys: string[];
  /** required keys still empty — flagged so staff knows what to check */
  missingRequired: string[];
  /** Delivery details keyed by their `customers` column (phone, city, ...). */
  customer: Record<string, string>;
  /** Cities/provinces that don't exist or don't match, for staff to confirm. */
  places: PlaceIssue[];
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
  serviceId: string,
  orderId?: string | null
): Promise<ActionResult<ParseResult>> {
  return run(async () => {
    await requireStaff();

    const supabase = createClient();

    // Both switches are read per call, so turning parsing off in Settings takes
    // effect on the next click rather than the next deploy.
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["parsing_enabled", "parsing_ai_enabled"]);
    const flag = new Map((settings ?? []).map((r) => [r.key, r.value ?? ""]));
    if ((flag.get("parsing_enabled") ?? "true") === "false") {
      throw new Error(
        "Auto-fill is switched off. An admin can turn it back on in Settings → Auto-fill."
      );
    }
    const aiEnabled = (flag.get("parsing_ai_enabled") ?? "false") !== "false";

    const trimmed = text.trim();
    if (!trimmed) {
      const empty: ParseResult = {
        values: {},
        filledKeys: [],
        missingRequired: [],
        customer: {},
        places: [],
        tier: 1,
        aiUnavailable: false,
      };
      return empty;
    }
    // Bound what we ever send to the API / process.
    const input = trimmed.slice(0, MAX_PASTE_CHARS);

    const { data: service, error } = await supabase
      .from("services")
      .select("code, form_fields")
      .eq("id", serviceId)
      .single();
    if (error) throw new Error(error.message);

    const docFields = (service.form_fields ?? []) as FormFieldDef[];
    // The delivery details ride along in the same pass — they are in the same
    // message, and a second parse would double the cost for no benefit.
    const fields = [...docFields, ...DELIVERY_FIELDS];
    const scoping = {
      deliveryOnly: DELIVERY_ONLY_IN_BLOCK,
      documentOnly: NEVER_IN_DELIVERY_BLOCK,
    };

    // --- Tier 1: free, instant, deterministic ---
    const t1 = parseTier1(input, fields, scoping);
    let values = { ...t1.values };
    let filledKeys = [...t1.filledKeys];
    let tier: 1 | 2 = 1;
    let aiUnavailable = false;
    let tokensIn = 0;
    let tokensOut = 0;

    // --- Tier 2: only when Tier 1 left required fields empty, and only when
    // the admin has accepted the per-parse API cost ---
    if (t1.missingRequired.length > 0 && aiEnabled) {
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

    // "Full Name: Juan Dela Cruz" arrives as one line but the PSA form has
    // three boxes. Spread it before deciding what's still missing.
    filledKeys = filledKeys.concat(expandNameGroups(values, fields));

    // Split the delivery details back out — they belong to the customer, not
    // the document, and are saved to a different table.
    const customer: Record<string, string> = {};
    for (const [k, col] of Object.entries(DELIVERY_TO_CUSTOMER)) {
      const v = values[k];
      if (v?.trim()) customer[col] = v.trim();
      delete values[k];
    }
    filledKeys = filledKeys.filter((k) => !(k in DELIVERY_TO_CUSTOMER));

    // Check the places against the PSA's own list before staff act on them.
    const places = placeIssues([
      {
        group: "birth" as const,
        cityLabel: "Place of birth — city",
        provinceLabel: "Place of birth — province",
        city: values.birth_city,
        province: values.birth_province,
      },
      {
        group: "delivery" as const,
        cityLabel: "Delivery city",
        provinceLabel: "Delivery province",
        city: customer.city,
        province: customer.province,
      },
    ]);

    const missingRequired = docFields
      .filter((f) => f.required && !values[f.key])
      .map((f) => f.key);

    // Cost visibility (§9). Never blocks the parse.
    try {
      await supabase.from("parse_logs").insert({
        order_id: orderId ?? null,
        service_code: service.code,
        tier,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
      });
    } catch {
      /* logging is best-effort */
    }

    return { values, filledKeys, missingRequired, customer, places, tier, aiUnavailable };
  });
}
