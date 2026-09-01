/**
 * "Pa-check po — tama ba lahat?", the strip sent with a document image.
 *
 * On the confirmation slip this is baked into the card; the PSA form is a
 * replica of the official sheet, so its banner rides above the form as a
 * separate strip — present only in the picture staff send the customer, never
 * on the printed form, which the image path arranges by adding this alongside
 * the form and the print path by leaving it out.
 */
export function CustomerCheckBanner({
  width,
  businessName = "DocuAssist PH",
}: {
  /** Matches the form it sits above, so the two read as one image. */
  width: number;
  businessName?: string;
}) {
  return (
    <div
      className="flex flex-col overflow-hidden bg-white font-sans"
      style={{ width, border: "3px solid #1e3a5f", borderBottom: "none" }}
    >
      <div className="bg-[#1e3a5f] px-4 py-2.5 text-white">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#eda100]">
          {businessName}
        </p>
        <p className="text-[16px] font-bold leading-tight">
          Pa-check po ng inyong detalye — tama ba lahat?
        </p>
        <p className="mt-0.5 text-[13px] text-white/85">
          May mali po ba? I-message niyo lang kami agad para ma-ayos bago namin
          i-file sa PSA.
        </p>
      </div>
    </div>
  );
}
