import { PSA_FORMS, splitDate, type FormRow } from "@/lib/psa-forms";

/* --- How big the form is drawn ----------------------------------------------
   The sheet is fixed, so every millimetre the type gains has to be taken from
   somewhere else. S multiplies the type and the character boxes; the fixed
   costs around them — the label gutter, the padding inside each section, the
   space between rows — are cut to pay for it.

   S is not a free dial. A name row is thirty boxes wide and the widest form is
   already 945px tall in a 990px space, so the ceiling is what the paper allows
   with the gutter as narrow as the longest label can bear. Raising it further
   pushes a name row past the right edge or the last section off the bottom;
   both sheets are measured against those limits before this ships.          */
const S = 1.2;

/* The encoded characters get their own multiplier, now 1.2x the 1.3 they
   started at. They are the only thing on the sheet a PSA clerk actually reads
   off our copy — the labels and the boilerplate around them are already on the
   form the clerk knows — and a letter needs no more room than the box already
   gives it, where a label this size would wrap in the narrowed gutter and push
   the last section off the page. Measured: at 1.3 throughout, the birth form
   runs 1141px in a 990px space; keeping the growth to the characters holds it
   under the sheet, because the box height is fixed by z() and the type sits
   inside it on leading-none — a bigger character costs width inside its own
   box, not height down the page.                                           */
const T = 1.3 * 1.2;

/** A drawn box or gap, scaled. */
const z = (n: number) => `${Math.round(n * S * 10) / 10}px`;
/** A drawn type size, scaled. */
const t = (n: number) => `${Math.round(n * T * 10) / 10}px`;

/** The form's own width, and the label gutter beside each row of boxes. */
const FORM_W = 760;
// 27 boxes at 18px scaled by S, plus this, has to clear the section's padding
// and both borders inside a 760px form. Dropping the box count from 30 to 27
// bought the width, so the gutter is wide enough that "Middle Name" and
// "Place of Birth" sit on one line instead of wrapping.
const GUTTER = 140;

/* Which form this is, readable across a room.
   A batch print is a stack of mixed forms that then has to be sorted by hand
   before anything is filled in, and the title line — set at the same weight as
   three other lines of letterhead — was the only thing telling them apart. PSA
   already colour-codes these on paper (CENOMAR green, marriage pink, death
   yellow, birth white), so the highlight borrows that same code rather than
   inventing a second one: the printed sheet matches the paper it belongs on.
   Backgrounds survive printing because globals.css forces print-color-adjust
   in @media print; on a mono printer these fall back to distinguishable greys
   and the border keeps the box readable either way. */
const PAPER_TINT: Record<string, { bg: string; border: string }> = {
  Green: { bg: "#86EFAC", border: "#15803D" },
  Yellow: { bg: "#FDE047", border: "#A16207" },
  Pink: { bg: "#F9A8D4", border: "#BE185D" },
  // Birth is issued on white, so it takes the box without the colour — the
  // shape stays identical across the four so nothing looks out of place.
  White: { bg: "#FFFFFF", border: "#000000" },
};

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
          className="flex shrink-0 items-center justify-center border-l border-black font-semibold leading-none last:border-r"
          style={{
            height: z(22),
            width: z(18),
            fontSize: t(13),
            borderBottom: "1px solid #000",
          }}
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
    <div className="flex items-start" style={{ gap: z(4), paddingBlock: z(1) }}>
      {/* Narrower than the drawn form's gutter and free to wrap: the boxes
          need the width more than a two-word label needs one line. */}
      <span
        className="shrink-0 leading-tight"
        style={{ width: `${GUTTER}px`, paddingTop: z(3), fontSize: z(11) }}
      >
        {row.label}
      </span>
      <div className="min-w-0">
        {row.kind === "boxes" && <Boxes value={value} count={row.boxes ?? 20} />}

        {row.kind === "date" && (() => {
          const d = splitDate(value);
          return (
            <div className="flex items-start" style={{ gap: z(6) }}>
              <div>
                <Boxes value={d.month} count={12} />
                <p className="text-center tracking-wide" style={{ fontSize: z(8) }}>
                  MONTH
                </p>
              </div>
              <div>
                <Boxes value={d.day} count={2} />
                <p className="text-center tracking-wide" style={{ fontSize: z(8) }}>
                  DAY
                </p>
              </div>
              <div>
                <Boxes value={d.year} count={4} />
                <p className="text-center tracking-wide" style={{ fontSize: z(8) }}>
                  YEAR
                </p>
              </div>
            </div>
          );
        })()}

        {row.kind === "checkbox" && (
          <div
            className="flex flex-wrap"
            style={{ columnGap: z(12), rowGap: z(3), paddingTop: z(2) }}
          >
            {(row.options ?? []).map((opt) => {
              // Tick the box when the encoded value matches this option.
              const on =
                value.trim().toLowerCase() === opt.toLowerCase() ||
                (!value.trim() &&
                  row.defaultChecked?.toLowerCase() === opt.toLowerCase()) ||
                (opt === "Others" &&
                  value.trim() !== "" &&
                  !(row.options ?? []).some(
                    (o) => o.toLowerCase() === value.trim().toLowerCase()
                  ));
              return (
                <span
                  key={opt}
                  className="flex items-center"
                  style={{ gap: z(5), fontSize: z(11) }}
                >
                  <span
                    className="flex items-center justify-center border border-black font-bold leading-none"
                    style={{ height: z(13), width: z(13), fontSize: z(11) }}
                  >
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
                <span className="italic" style={{ fontSize: z(11) }}>
                  ({value})
                </span>
              )}
          </div>
        )}

        {row.caption && (
          <p className="tracking-wide" style={{ fontSize: z(8) }}>
            {row.caption}
          </p>
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
}: {
  serviceCode: string;
  serviceName: string;
  details: Record<string, string>;
}) {
  const tpl = PSA_FORMS[serviceCode];
  const tint = PAPER_TINT[tpl?.paper ?? ""] ?? PAPER_TINT.White;

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
      className="psa-form flex flex-col bg-white font-sans text-black"
      style={{ width: `${FORM_W}px`, padding: "8px", border: "2px solid #000" }}
    >
      {/* Header */}
      <div
        className="bg-black text-center font-bold tracking-wide text-white"
        style={{ paddingBlock: z(1), fontSize: z(10) }}
      >
        THIS FORM IS NOT FOR SALE
      </div>
      <div className="mt-0.5 flex items-center gap-3">
        {/* The PSA seal sits at the top left of the real sheet. Same-origin so
            html-to-image can inline it when staff copy the form as an image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/psa-logo.svg"
          alt="Philippine Statistics Authority"
          width={55}
          height={52}
          className="shrink-0"
        />
        <div className="flex-1 text-center leading-tight">
          <p style={{ fontSize: z(9) }}>Republic of the Philippines</p>
          <p className="font-bold" style={{ fontSize: z(10) }}>
            Philippine Statistics Authority
          </p>
          <p className="font-semibold" style={{ fontSize: z(9) }}>
            OFFICE OF THE CIVIL REGISTRAR GENERAL
          </p>
          {/* Boxed and tinted to the form's own paper colour, so a sorted
              stack can be split by eye without reading a word of it. */}
          <p
            className="mt-0.5 inline-block font-bold leading-tight"
            style={{
              fontSize: z(13),
              backgroundColor: tint.bg,
              border: `1.5px solid ${tint.border}`,
              borderRadius: z(3),
              paddingInline: z(8),
              paddingBlock: z(2),
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
            }}
          >
            {tpl.title}
          </p>
        </div>
        {/* Balances the seal so the title stays centred on the sheet. */}
        <span className="w-[55px] shrink-0" aria-hidden />
      </div>

      <div
        className="mt-0.5 border border-black"
        style={{
          paddingInline: z(6),
          paddingBlock: z(1),
          fontSize: z(8),
          lineHeight: 1.15,
        }}
      >
        <p className="font-bold">
          IMPORTANT: PLEASE READ GENERAL INSTRUCTIONS BEFORE FILLING OUT THE FORM
        </p>
        <p>
          1. Please PRINT letters in the spaces provided. Please CHECK (✓)
          appropriate box (es).
        </p>
        <p>2. A valid ID is required from the owner of the document.</p>
        <p>
          3. An authorization letter and ID of the document owner with the ID of
          the requester are required.
        </p>
      </div>

      {/* Sections. On paper the form is stretched to fill the sheet (see the
          .psa-form min-height in globals.css), and the slack goes here rather
          than leaving a band of white below the form. Each section takes a
          share proportional to how many rows it holds, so a three-row name
          block doesn't end up as tall as the seven-row owner block. */}
      <div className="mt-0.5 flex flex-1 flex-col border border-black">
        {tpl.sections.map((section, si) => (
          <div
            key={si}
            className={`flex flex-col${si > 0 ? " border-t border-black" : ""}`}
            style={{ flexGrow: section.rows.length }}
          >
            {section.heading && (
              <p
                className="border-b border-black bg-gray-100 font-bold"
                style={{
                  paddingInline: z(6),
                  paddingBlock: z(1),
                  fontSize: z(10),
                }}
              >
                {section.heading}
              </p>
            )}
            <div
              className="flex flex-1 flex-col justify-evenly"
              style={{ paddingInline: z(3), paddingBlock: z(2) }}
            >
              {section.rows.map((row, ri) => (
                <Row key={ri} row={row} details={details} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        className="mt-0.5 border border-black"
        style={{ paddingInline: z(6), paddingBlock: z(2) }}
      >
        <p className="text-center" style={{ fontSize: z(10) }}>
          PRESENTED VALID IDs AND AUTHORIZATION LETTER?{" "}
          <span className="ml-2">☐ YES</span>
          <span className="ml-3">☐ NO</span>
        </p>
      </div>
      <p className="mt-0.5 text-center font-semibold" style={{ fontSize: z(9) }}>
        UNCLAIMED DOCUMENTS AFTER THIRTY (30) DAYS FROM THE DATE OF RELEASE WILL
        BE DISPOSED OF.
      </p>
      <div
        className="mt-0.5 border border-black text-center font-bold"
        style={{ paddingBlock: z(2), fontSize: z(12) }}
      >
        ☐ FOR PAYMENT
      </div>
    </div>
  );
}
