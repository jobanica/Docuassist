import type { FormFieldDef } from "@/lib/types";
import { fieldDisplayValue } from "@/lib/form-fields";

/**
 * A plain confirmation slip for the ID services, as an image the customer can
 * check.
 *
 * TIN and PhilHealth have no PSA form to send, but the same need: before the
 * supplier files anything, the customer should see their own details laid out
 * and say whether they are right. So their encoded fields are drawn as a clean
 * card — the values large, the labels quiet — that staff copy and send on
 * Messenger.
 *
 * Only what the customer filled in. Never the account-type question, the office
 * fee, or anything internal — this is theirs to proofread, nothing more.
 */

/** Keys that are ours, not the customer's, and never belong on the slip. */
const INTERNAL_KEYS = new Set(["account_type"]);

export function DetailsSlip({
  serviceName,
  fields,
  details,
  businessName = "DocuAssist PH",
}: {
  serviceName: string;
  fields: FormFieldDef[];
  details: Record<string, string>;
  businessName?: string;
}) {
  const rows = (fields ?? [])
    .filter((f) => !INTERNAL_KEYS.has(f.key))
    .map((f) => ({
      label: f.label,
      value: fieldDisplayValue(f, details[f.key]).trim(),
    }))
    .filter((r) => r.value);

  return (
    <div
      className="flex w-[560px] flex-col bg-white font-sans text-[#0f172a]"
      style={{ border: "3px solid #1e3a5f" }}
    >
      {/* Header */}
      <div className="bg-[#1e3a5f] px-5 py-3 text-white">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-[#eda100]">
          {businessName}
        </p>
        <p className="text-[20px] font-bold leading-tight">{serviceName}</p>
        <p className="mt-0.5 text-[13px] text-white/80">
          Pa-check po ng inyong detalye — tama ba lahat bago namin i-process?
        </p>
      </div>

      {/* The details */}
      <div className="px-5 py-4">
        <dl className="divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.label} className="flex gap-4 py-2">
              <dt className="w-[190px] shrink-0 pt-0.5 text-[13px] text-slate-500">
                {r.label}
              </dt>
              <dd className="flex-1 text-[17px] font-semibold leading-snug">
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 bg-slate-50 px-5 py-3">
        <p className="text-[13px] font-semibold text-[#1e3a5f]">
          May mali po ba? I-message niyo lang kami agad para ma-ayos bago
          i-file.
        </p>
        <p className="mt-0.5 text-[12px] text-slate-500">
          Once filed, changes may cost extra or need a new application.
        </p>
      </div>
    </div>
  );
}
