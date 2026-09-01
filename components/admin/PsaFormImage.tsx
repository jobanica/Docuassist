"use client";

import { PsaForm } from "@/components/print/PsaForm";
import { CaptureButtons } from "./CaptureButtons";

/**
 * Copy the filled PSA form as an image without leaving the order.
 *
 * Staff send the form to the customer on Messenger to confirm their details
 * before anything is filed at the PSA. The picture-making lives in
 * CaptureButtons, shared with the ID confirmation slip; this only hands it the
 * form to photograph.
 */
export function PsaFormImage({
  serviceCode,
  serviceName,
  details,
  label,
}: {
  serviceCode: string;
  serviceName: string;
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
      copyLabel="Copy form image"
      readyHint="the filled PSA form, as a picture"
      emptyHint="fill the PSA form fields first"
    >
      <PsaForm
        serviceCode={serviceCode}
        serviceName={serviceName}
        details={details}
      />
    </CaptureButtons>
  );
}
