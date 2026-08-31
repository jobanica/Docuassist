import Anthropic from "@anthropic-ai/sdk";
import type { FormFieldDef } from "@/lib/types";
import { normalizeDate } from "./tier1";
import { coerceValues, schemaFor, stripCodeFences } from "./tier2";
import { MAX_IMAGES } from "./vision-limits";

export interface VisionImage {
  /** Base64 payload, no data: prefix. */
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

export interface VisionResult {
  values: Record<string, string>;
  tokensIn: number;
  tokensOut: number;
}

export { MAX_IMAGES } from "./vision-limits";

function systemPrompt(fields: FormFieldDef[]): string {
  const lines = fields
    .map((f) => `- ${f.key} (${f.type}): ${f.label}${f.required ? " [required]" : ""}`)
    .join("\n");

  return [
    "You read a photo or scan of a Philippine civil registry document — a PSA birth, marriage or death certificate, a CENOMAR, or an ID — and extract the details needed to re-order it.",
    "The image may be a phone photo: skewed, shadowed, or partly cut off. Older certificates are handwritten or typewritten.",
    "",
    "Extract ONLY these fields:",
    lines,
    "",
    "Rules:",
    '- Return "" for any field you cannot read with confidence. A wrong value is far worse than a blank one: it is filed at the PSA counter and rejected.',
    "- Never infer a value from another field, and never complete a partly hidden word. If half a surname is under a fold, return \"\".",
    "- A certificate has separate blocks for the person it is about and for each parent. Keep them apart: a name under the father's block belongs only to the father's fields.",
    "- On a birth certificate the child is the document owner. On a marriage certificate the husband and wife are; on a death certificate the deceased is.",
    "- Copy names and places exactly as printed, including particles (Dela Cruz, De los Santos) and spelling that looks wrong to you. Do not translate, expand abbreviations, or tidy them.",
    "- Registry forms print place of birth as city/municipality and province separately. Never put a province in a city field or vice versa.",
    "- delivery_* fields are where a parcel is sent. A certificate never states that — always return \"\" for them.",
    "- For date fields return YYYY-MM-DD. A registry date is often written 'MARCH 04, 1990' or '04/03/1990'; if the order of day and month is ambiguous, return \"\".",
    "- For number fields return digits only.",
    "- Do not describe the image or add commentary — only the structured fields.",
  ].join("\n");
}

/**
 * Read the document fields straight off a photo of the certificate.
 *
 * Customers often send the certificate itself rather than filling anything in,
 * and re-typing it is both the slowest part of intake and where the typos come
 * from. The image is sent to the model and kept nowhere — not in the database,
 * not on disk — because a birth certificate is about as sensitive as a
 * customer's data gets.
 *
 * Returns null when the key is missing or the call fails, so the caller can
 * say so plainly rather than the screen breaking.
 */
export async function parseDocumentImages(
  images: VisionImage[],
  fields: FormFieldDef[]
): Promise<VisionResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (images.length === 0) return null;

  const model = process.env.ANTHROPIC_PARSE_MODEL || "claude-haiku-4-5";
  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2000,
      system: systemPrompt(fields),
      messages: [
        {
          role: "user",
          content: [
            ...images.slice(0, MAX_IMAGES).map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mediaType,
                data: img.data,
              },
            })),
            {
              type: "text" as const,
              text: "Read this document and return the fields you can see. Leave anything unreadable blank.",
            },
          ],
        },
      ],
      output_config: { format: { type: "json_schema", schema: schemaFor(fields) } },
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(stripCodeFences(textBlock.text));
    } catch {
      console.warn("[vision] unparseable JSON from the model.");
      return null;
    }
    if (!raw || typeof raw !== "object") return null;

    return {
      values: coerceValues(raw, fields, normalizeDate),
      tokensIn: response.usage?.input_tokens ?? 0,
      tokensOut: response.usage?.output_tokens ?? 0,
    };
  } catch (e) {
    console.warn(
      "[vision] call failed:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
