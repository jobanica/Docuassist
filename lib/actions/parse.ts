"use server";

import { run, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { expandNameGroups, normalizeSex, parseTier1 } from "@/lib/parse/tier1";
import {
  placeIssues,
  documentPlacePair,
  type PlaceIssue,
} from "@/lib/parse/places";
import {
  DELIVERY_FIELDS,
  DELIVERY_ONLY_IN_BLOCK,
  DELIVERY_TO_CUSTOMER,
  NEVER_IN_DELIVERY_BLOCK,
} from "@/lib/parse/delivery";
import { parseTier2 } from "@/lib/parse/tier2";
import {
  parseDocumentImages,
  MAX_IMAGES,
  type VisionImage,
} from "@/lib/parse/vision";
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
  /** 1 = rules, 2 = AI read the text, 3 = AI read a photo of the document */
  tier: 1 | 2 | 3;
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
    normalizeSex(values);

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
    // The document's own pair is read off its schema, so a marriage or death
    // certificate is checked on its own keys rather than being skipped.
    const pair = documentPlacePair(docFields);
    const places = placeIssues([
      ...(pair
        ? [
            {
              group: "birth" as const,
              cityLabel: pair.cityLabel,
              provinceLabel: pair.provinceLabel,
              city: values[pair.cityKey],
              province: values[pair.provinceKey],
            },
          ]
        : []),
      {
        group: "delivery" as const,
        cityLabel: "Delivery city",
        provinceLabel: "Delivery province",
        barangayLabel: "Delivery barangay",
        city: customer.city,
        province: customer.province,
        barangay: customer.barangay,
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

/** Biggest base64 payload we accept per image (~3MB of JPEG). */
const MAX_IMAGE_CHARS = 4_200_000;

/**
 * Read the document straight off a photo of it.
 *
 * Customers frequently send the certificate itself instead of filling anything
 * in, and re-typing it by hand is both the slowest part of intake and where
 * the typos come from.
 *
 * The image is forwarded to the model and stored nowhere — not in the
 * database, not on disk. Only the fields it read come back, and as with every
 * other parse they are returned for staff to check, never written directly.
 */
export async function parseDocumentImage(
  images: VisionImage[],
  serviceId: string,
  orderId?: string | null
): Promise<ActionResult<ParseResult>> {
  return run(async () => {
    await requireStaff();
    const supabase = createClient();

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
    // Reading a photo is only possible with the AI; there is no rule-based
    // fallback to quietly degrade to, so say so rather than returning nothing.
    if ((flag.get("parsing_ai_enabled") ?? "false") === "false") {
      throw new Error(
        "Reading a photo needs the AI reader, which is switched off. An admin can turn it on in Settings → Auto-fill."
      );
    }

    const shots = (images ?? []).slice(0, MAX_IMAGES);
    if (shots.length === 0) throw new Error("Attach a photo of the document first.");
    for (const img of shots) {
      if (!img?.data) throw new Error("That image could not be read.");
      if (img.data.length > MAX_IMAGE_CHARS) {
        throw new Error(
          "That photo is too large even after resizing. Try a screenshot instead of the original file."
        );
      }
    }

    const { data: service, error } = await supabase
      .from("services")
      .select("code, form_fields")
      .eq("id", serviceId)
      .single();
    if (error) throw new Error(error.message);

    const docFields = (service.form_fields ?? []) as FormFieldDef[];
    const result = await parseDocumentImages(shots, docFields);
    if (!result) {
      throw new Error(
        "The photo couldn't be read. Try a clearer, straighter shot — or type the details in by hand."
      );
    }

    // "Full Name" read off the certificate as one line still has to reach the
    // three boxes the PSA form prints.
    const values = { ...result.values };
    expandNameGroups(values, docFields);
    normalizeSex(values);

    const filledKeys = Object.keys(values);
    const missingRequired = docFields
      .filter((f) => f.required && !values[f.key])
      .map((f) => f.key);

    // A certificate carries the document's own place of birth, never a
    // delivery address — so only that pair is worth checking here.
    const pair = documentPlacePair(docFields);
    const places = placeIssues(
      pair
        ? [
            {
              group: "birth" as const,
              cityLabel: pair.cityLabel,
              provinceLabel: pair.provinceLabel,
              city: values[pair.cityKey],
              province: values[pair.provinceKey],
            },
          ]
        : []
    );

    try {
      await supabase.from("parse_logs").insert({
        order_id: orderId ?? null,
        service_code: service.code,
        tier: 3,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
      });
    } catch {
      /* logging is best-effort */
    }

    return {
      values,
      filledKeys,
      missingRequired,
      customer: {},
      places,
      tier: 3 as const,
      aiUnavailable: false,
    };
  });
}
