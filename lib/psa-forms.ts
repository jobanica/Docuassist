/**
 * Layout definitions for the PSA application forms, so an encoded order can be
 * printed onto a replica of the real form.
 *
 * The PSA forms print one character per box, so each row declares how many
 * boxes it has. Box counts follow the printed forms closely enough that a
 * filled replica reads the same; they are not claimed to be pixel-exact.
 */

export type RowKind = "boxes" | "date" | "checkbox";

export interface FormRow {
  /** Label printed in the left gutter. */
  label: string;
  /** form_details key this row draws from. */
  key?: string;
  kind: RowKind;
  /** Number of character boxes (kind: "boxes"). */
  boxes?: number;
  /** Caption printed under the row, e.g. "City / Municipality". */
  caption?: string;
  /** Checkbox options (kind: "checkbox"). */
  options?: string[];
}

export interface FormSection {
  /** Section heading, e.g. "NAME OF FATHER". Omit for an unheaded block. */
  heading?: string;
  rows: FormRow[];
}

export interface PsaFormTemplate {
  /** Form title as printed on the PSA form. */
  title: string;
  /** The paper colour PSA uses for this form, for the staff note. */
  paper: string;
  sections: FormSection[];
}

const NAME_BOXES = 26;
const PLACE_BOXES = 30;

/** Owner / parent name block shared by the birth and CENOMAR forms. */
function nameBlock(heading: string, prefix: string, lastLabel = "Last Name"): FormSection {
  return {
    heading,
    rows: [
      { label: lastLabel, key: `${prefix}last`, kind: "boxes", boxes: NAME_BOXES },
      { label: "First Name", key: `${prefix}first`, kind: "boxes", boxes: NAME_BOXES },
      { label: "Middle Name", key: `${prefix}middle`, kind: "boxes", boxes: NAME_BOXES },
    ],
  };
}

const OWNER_HEADING = "OWNER'S PERSONAL INFORMATION (FOR MARRIED FEMALE, PLEASE USE MAIDEN NAME)";

const birthLike = (title: string, paper: string, dateLabel: string, placeLabel: string,
                   cityKey: string, provKey: string, countryKey: string): PsaFormTemplate => ({
  title,
  paper,
  sections: [
    {
      rows: [
        { label: "Number of copies", key: "copies", kind: "boxes", boxes: 3 },
        { label: "Birth Reference No. (BReN, if known)", key: "bren", kind: "boxes", boxes: 18 },
        { label: "Sex", key: "sex", kind: "checkbox", options: ["Male", "Female"] },
      ],
    },
    {
      heading: OWNER_HEADING,
      rows: [
        { label: "Last Name", key: "last_name", kind: "boxes", boxes: NAME_BOXES },
        { label: "First Name", key: "first_name", kind: "boxes", boxes: NAME_BOXES },
        { label: "Middle Name", key: "middle_name", kind: "boxes", boxes: NAME_BOXES },
        { label: dateLabel, key: "date_of_event", kind: "date" },
        { label: placeLabel, key: cityKey, kind: "boxes", boxes: PLACE_BOXES, caption: "City / Municipality" },
        { label: "", key: provKey, kind: "boxes", boxes: PLACE_BOXES, caption: "Province" },
        { label: "Country (if abroad only)", key: countryKey, kind: "boxes", boxes: PLACE_BOXES, caption: "Country" },
      ],
    },
    nameBlock("NAME OF FATHER", "father_"),
    nameBlock("MAIDEN NAME OF MOTHER", "mother_"),
    { rows: [{ label: "Purpose", key: "purpose", kind: "boxes", boxes: PLACE_BOXES }] },
  ],
});

export const PSA_FORMS: Record<string, PsaFormTemplate> = {
  psa_birth: birthLike(
    "APPLICATION FORM - BIRTH CERTIFICATE", "White",
    "Date of Birth", "Place of Birth",
    "birth_city", "birth_province", "birth_country"
  ),

  cenomar: birthLike(
    "APPLICATION FORM - CERTIFICATE OF NO RECORD OF MARRIAGE (CENOMAR)", "Green",
    "Date of Birth", "Place of Birth",
    "birth_city", "birth_province", "birth_country"
  ),

  psa_marriage: {
    title: "APPLICATION FORM - MARRIAGE CERTIFICATE",
    paper: "Pink",
    sections: [
      { rows: [{ label: "Number of copies", key: "copies", kind: "boxes", boxes: 3 }] },
      nameBlock("NAME OF HUSBAND", "husband_"),
      nameBlock("MAIDEN NAME OF WIFE", "wife_"),
      {
        rows: [
          { label: "Date of Marriage", key: "date_of_event", kind: "date" },
          { label: "Place of Marriage", key: "marriage_city", kind: "boxes", boxes: PLACE_BOXES, caption: "City / Municipality" },
          { label: "", key: "marriage_province", kind: "boxes", boxes: PLACE_BOXES, caption: "Province" },
          { label: "Country (if abroad only)", key: "marriage_country", kind: "boxes", boxes: PLACE_BOXES, caption: "Country" },
          { label: "Purpose", key: "purpose", kind: "boxes", boxes: PLACE_BOXES },
        ],
      },
    ],
  },

  psa_death: {
    title: "APPLICATION FORM - DEATH CERTIFICATE",
    paper: "Yellow",
    sections: [
      {
        rows: [
          { label: "Number of copies", key: "copies", kind: "boxes", boxes: 3 },
          { label: "Birth Reference No. (BReN, if known)", key: "bren", kind: "boxes", boxes: 18 },
          { label: "Sex", key: "sex", kind: "checkbox", options: ["Male", "Female"] },
        ],
      },
      {
        heading: "NAME OF DECEASED",
        rows: [
          { label: "Last Name", key: "last_name", kind: "boxes", boxes: NAME_BOXES },
          { label: "First Name", key: "first_name", kind: "boxes", boxes: NAME_BOXES },
          { label: "Middle Name", key: "middle_name", kind: "boxes", boxes: NAME_BOXES },
          { label: "Date of Death", key: "date_of_event", kind: "date" },
          { label: "Place of Death", key: "death_city", kind: "boxes", boxes: PLACE_BOXES, caption: "City / Municipality" },
          { label: "", key: "death_province", kind: "boxes", boxes: PLACE_BOXES, caption: "Province" },
          { label: "Country (if abroad only)", key: "death_country", kind: "boxes", boxes: PLACE_BOXES, caption: "Country" },
        ],
      },
      {
        rows: [
          {
            label: "Purpose",
            key: "purpose",
            kind: "checkbox",
            options: ["Claim Benefits / Loan", "Passport / Travel", "Employment (Local)",
                      "Employment (Abroad)", "School Requirements", "Others"],
          },
        ],
      },
    ],
  },
};

/** Split an ISO date into the MONTH / DAY / YEAR the PSA form prints. */
export function splitDate(iso: string | undefined): {
  month: string; day: string; year: string;
} {
  if (!iso) return { month: "", day: "", year: "" };
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { month: "", day: "", year: "" };
  const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  return {
    month: MONTHS[Number(m[2]) - 1] ?? "",
    day: m[3],
    year: m[1],
  };
}
