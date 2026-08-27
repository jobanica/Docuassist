import { PSA_FORMS, splitDate, type FormRow } from "@/lib/psa-forms";

/**
 * Values longer than their box count get cut off on the form. Silently
 * truncating a name would file a wrong PSA request, so the page warns staff
 * instead — they can shorten it deliberately or use a longer field.
 */
export function findOverflows(
  serviceCode: string,
  details: Record<string, string>
): { label: string; value: string; boxes: number }[] {
  const tpl = PSA_FORMS[serviceCode];
  if (!tpl) return [];
  const out: { label: string; value: string; boxes: number }[] = [];
  for (const section of tpl.sections) {
    for (const row of section.rows) {
      if (row.kind !== "boxes" || !row.key) continue;
      const v = (details[row.key] ?? "").trim();
      const n = row.boxes ?? 20;
      if (v.length > n) {
        out.push({ label: row.label || row.caption || row.key, value: v, boxes: n });
      }
    }
  }
  return out;
}

/** One character per box, the way the PSA forms are printed. */
function Boxes({ value, count }: { value: string; count: number }) {
  const chars = (value ?? "").toUpperCase().slice(0, count).split("");
  return (
    <div className="flex">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="flex h-[18px] w-[15px] shrink-0 items-center justify-center border-l border-black text-[11px] font-semibold leading-none last:border-r"
          style={{ borderBottom: "1px solid #000" }}
        >
          {chars[i] ?? ""}
        </span>
      ))}
    </div>
  );
}

function Row({
  row,
  details,
}: {
  row: FormRow;
  details: Record<string, string>;
}) {
  const value = row.key ? (details[row.key] ?? "") : "";

  return (
    <div className="flex items-start gap-2 py-[3px]">
      <span className="w-[150px] shrink-0 pt-[3px] text-[9px] leading-tight">
        {row.label}
      </span>
      <div className="min-w-0">
        {row.kind === "boxes" && <Boxes value={value} count={row.boxes ?? 20} />}

        {row.kind === "date" && (() => {
          const d = splitDate(value);
          return (
            <div className="flex items-start gap-2">
              <div>
                <Boxes value={d.month} count={12} />
                <p className="text-center text-[7px] tracking-wide">MONTH</p>
              </div>
              <div>
                <Boxes value={d.day} count={2} />
                <p className="text-center text-[7px] tracking-wide">DAY</p>
              </div>
              <div>
                <Boxes value={d.year} count={4} />
                <p className="text-center text-[7px] tracking-wide">YEAR</p>
              </div>
            </div>
          );
        })()}

        {row.kind === "checkbox" && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-[2px]">
            {(row.options ?? []).map((opt) => {
              // Tick the box when the encoded value matches this option.
              const on =
                value.trim().toLowerCase() === opt.toLowerCase() ||
                (opt === "Others" &&
                  value.trim() !== "" &&
                  !(row.options ?? []).some(
                    (o) => o.toLowerCase() === value.trim().toLowerCase()
                  ));
              return (
                <span key={opt} className="flex items-center gap-1 text-[9px]">
                  <span className="flex h-[11px] w-[11px] items-center justify-center border border-black text-[9px] font-bold leading-none">
                    {on ? "✓" : ""}
                  </span>
                  {opt}
                </span>
              );
            })}
            {/* Free-text purpose that didn't match a preset still needs printing. */}
            {value &&
              !(row.options ?? []).some(
                (o) => o.toLowerCase() === value.trim().toLowerCase()
              ) && (
                <span className="text-[9px] italic">({value})</span>
              )}
          </div>
        )}

        {row.caption && (
          <p className="text-[7px] tracking-wide">{row.caption}</p>
        )}
      </div>
    </div>
  );
}

/**
 * A printable replica of the PSA application form, filled from an order item's
 * encoded details. Rendered at a fixed width so print and the copied image are
 * identical regardless of screen size.
 */
export function PsaForm({
  serviceCode,
  serviceName,
  details,
  trackingCode,
  customerName,
}: {
  serviceCode: string;
  serviceName: string;
  details: Record<string, string>;
  trackingCode: string;
  customerName: string;
}) {
  const tpl = PSA_FORMS[serviceCode];

  if (!tpl) {
    return (
      <div className="w-[760px] border border-black bg-white p-6 text-[11px] text-black">
        <p className="font-bold">{serviceName}</p>
        <p className="mt-2">
          No PSA application form template exists for this service, so there is
          nothing to print. Encoded details:
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-1">
          {Object.entries(details).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[9px] uppercase text-gray-500">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div
      id="psa-form"
      className="w-[760px] bg-white p-5 font-sans text-black"
      style={{ border: "2px solid #000" }}
    >
      {/* Header */}
      <div className="bg-black py-[3px] text-center text-[11px] font-bold tracking-wide text-white">
        THIS FORM IS NOT FOR SALE
      </div>
      <div className="mt-1 text-center leading-tight">
        <p className="text-[10px]">Republic of the Philippines</p>
        <p className="text-[11px] font-bold">Philippine Statistics Authority</p>
        <p className="text-[10px] font-semibold">
          OFFICE OF THE CIVIL REGISTRAR GENERAL
        </p>
        <p className="mt-0.5 text-[11px] font-bold">{tpl.title}</p>
      </div>

      <div className="mt-2 border border-black px-2 py-1 text-[8px] leading-snug">
        <p className="font-bold">
          IMPORTANT: PLEASE READ GENERAL INSTRUCTIONS BEFORE FILLING OUT THE FORM
        </p>
        <p>1. Please PRINT letters in the spaces provided.</p>
        <p>2. A valid ID is required from the owner of the document.</p>
        <p>
          3. An authorization letter and ID of the document owner with the ID of
          the requester are required.
        </p>
      </div>

      {/* Sections */}
      <div className="mt-2 border border-black">
        {tpl.sections.map((section, si) => (
          <div key={si} className={si > 0 ? "border-t border-black" : ""}>
            {section.heading && (
              <p className="border-b border-black bg-gray-100 px-2 py-[2px] text-[9px] font-bold">
                {section.heading}
              </p>
            )}
            <div className="px-2 py-1">
              {section.rows.map((row, ri) => (
                <Row key={ri} row={row} details={details} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-2 border border-black px-2 py-1">
        <p className="text-center text-[9px]">
          PRESENTED VALID IDs AND AUTHORIZATION LETTER?{" "}
          <span className="ml-2">☐ YES</span>
          <span className="ml-3">☐ NO</span>
        </p>
      </div>
      <p className="mt-1 text-center text-[8px] font-semibold">
        UNCLAIMED DOCUMENTS AFTER THIRTY (30) DAYS FROM THE DATE OF RELEASE WILL
        BE DISPOSED OF.
      </p>
      <div className="mt-1 border border-black py-[2px] text-center text-[13px] font-bold">
        ☐ FOR PAYMENT
      </div>

      {/* Internal reference — helps staff match the sheet back to the order. */}
      <div className="mt-2 flex justify-between border-t border-dashed border-gray-400 pt-1 text-[8px] text-gray-600">
        <span>DocuAssist PH · {customerName}</span>
        <span className="font-mono">{trackingCode}</span>
      </div>
    </div>
  );
}
