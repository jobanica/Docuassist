import Anthropic from "@anthropic-ai/sdk";
import type { FormFieldDef } from "@/lib/types";
import { normalizeDate } from "./tier1";

export interface Tier2Result {
  values: Record<string, string>;
  tokensIn: number;
  tokensOut: number;
}

/** Strip ``` fences a model may wrap JSON in, before JSON.parse (§9). */
export function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/**
 * Build a JSON Schema from the service's configured form_fields. The field set
 * is admin-configurable at runtime, so the schema is generated per call rather
 * than declared statically. Every field is a string and always required;
 * "" means "not stated in the message".
 */
export function schemaFor(fields: FormFieldDef[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const f of fields) {
    properties[f.key] = {
      type: "string",
      description: `${f.label}. Return "" if the customer's message does not state it.`,
    };
  }
  return {
    type: "object",
    properties,
    required: fields.map((f) => f.key),
    additionalProperties: false,
  };
}

function systemPrompt(fields: FormFieldDef[]): string {
  const lines = fields
    .map(
      (f) =>
        `- ${f.key} (${f.type}): ${f.label}${f.required ? " [required]" : ""}`
    )
    .join("\n");

  return [
    "You extract Philippine document-request details from a customer's chat message.",
    "The message is written to a Filipino document-processing business and may be in English, Tagalog, or Taglish, in any format.",
    "",
    "Extract ONLY these fields:",
    lines,
    "",
    "Rules:",
    '- Return "" for any field the message does not clearly state. Never guess or invent a value.',
    "- The message often repeats the same labels under a heading for each person" +
      " (the applicant, then NAME OF FATHER, then NAME OF MOTHER). Keep them apart:" +
      " a name under a father heading belongs only to the father's fields, never" +
      " the applicant's. Labels before any heading belong to the applicant.",
    "- Names may arrive whole on one line. Split them as First / Middle / Last," +
      " keeping surname particles together (Dela Cruz, De los Santos).",
    "- delivery_* fields are where the parcel is sent, which is not the same as" +
      " where the person was born. Only fill delivery_city / delivery_province" +
      " from an address or delivery block, never from a place of birth, and" +
      " never copy a birthplace into them.",
    "- Copy names, places, and numbers exactly as written; do not translate or reformat them.",
    "- For date fields, return YYYY-MM-DD. If the year is missing or ambiguous, return \"\".",
    "- For number fields, return digits only.",
    "- Do not include commentary — only the structured fields.",
  ].join("\n");
}

/**
 * Keep only known keys, coerce to strings, drop empties. Shared with the image
 * reader, which returns the same shape from the same schema.
 */
export function coerceValues(
  raw: Record<string, unknown>,
  fields: FormFieldDef[],
  toDate: (v: string) => string
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) {
    const v = raw[f.key];
    if (v === null || v === undefined) continue;
    let s = String(v).trim();
    if (!s) continue;
    if (f.type === "date") s = toDate(s);
    if (f.type === "number") s = (s.match(/\d+/) ?? [""])[0];
    if (s) values[f.key] = s;
  }
  return values;
}

/**
 * Tier 2 — AI fallback (§9). Only called when Tier 1 left required fields
 * empty. Sends nothing but the pasted text; stores nothing.
 *
 * Returns null when the API key is absent (stubbed) or the call/parse fails,
 * so the caller can fall back gracefully to the Tier-1 result.
 */
export async function parseTier2(
  text: string,
  fields: FormFieldDef[]
): Promise<Tier2Result | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.info(
      "[parse] ANTHROPIC_API_KEY not set — skipping Tier-2 AI fallback (stubbed)."
    );
    return null;
  }

  const model = process.env.ANTHROPIC_PARSE_MODEL || "claude-haiku-4-5";
  const client = new Anthropic({ apiKey });
  const schema = schemaFor(fields);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2000,
      system: systemPrompt(fields),
      messages: [{ role: "user", content: text }],
      output_config: { format: { type: "json_schema", schema } },
    });

    const usage = {
      tokensIn: response.usage?.input_tokens ?? 0,
      tokensOut: response.usage?.output_tokens ?? 0,
    };

    // The response text is schema-constrained JSON. Strip any code fences
    // defensively, then JSON.parse inside a try/catch (§9).
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(stripCodeFences(textBlock.text));
    } catch {
      console.warn("[parse] Tier-2 returned unparseable JSON — falling back.");
      return null;
    }
    if (!raw || typeof raw !== "object") return null;

    return { values: coerceValues(raw, fields, normalizeDate), ...usage };
  } catch (e) {
    // Never fail the encode flow because the parse helper broke (§9).
    console.warn(
      "[parse] Tier-2 call failed — falling back to Tier-1 result:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
