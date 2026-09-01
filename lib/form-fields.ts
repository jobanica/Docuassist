import type { FormFieldDef } from "./types";

/**
 * A stored form value, as a person should read it.
 *
 * A select stores a stable code — "existing_unknown" survives someone
 * rewording the option later, where the label would not — so everywhere the
 * details are shown rather than edited has to translate it back. The supplier
 * reading an application should not have to know our codes.
 */
export function fieldDisplayValue(
  field: Pick<FormFieldDef, "type" | "options">,
  raw: string | undefined | null
): string {
  const v = (raw ?? "").trim();
  if (!v || field.type !== "select") return v;
  return field.options?.find((o) => o.value === v)?.label ?? v;
}
