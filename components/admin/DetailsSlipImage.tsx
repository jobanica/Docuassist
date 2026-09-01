"use client";

import { DetailsSlip } from "@/components/print/DetailsSlip";
import { CaptureButtons } from "./CaptureButtons";
import type { FormFieldDef } from "@/lib/types";

/**
 * The ID confirmation slip as an image, for the TIN and PhilHealth services.
 *
 * They have no PSA form to send, but the same need: the customer should see
 * their own details and confirm them before the supplier files anything. Same
 * two buttons as the PSA form, a different picture.
 */
export function DetailsSlipImage({
  serviceName,
  fields,
  details,
  label,
}: {
  serviceName: string;
  fields: FormFieldDef[];
  /** The values on screen, so an unsaved correction is in the picture too. */
  details: Record<string, string>;
  /** Customer and document, for the downloaded file's name. */
  label: string;
}) {
  const hasDetails = Object.values(details).some((v) => String(v ?? "").trim());
  return (
    <CaptureButtons
      filenameLabel={label}
      ready={hasDetails}
      copyLabel="Copy details to send"
      readyHint="a slip of these details for the customer to check"
      emptyHint="fill in the details first"
    >
      <DetailsSlip
        serviceName={serviceName}
        fields={fields}
        details={details}
      />
    </CaptureButtons>
  );
}
