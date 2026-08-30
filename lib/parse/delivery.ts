import type { FormFieldDef } from "@/lib/types";

/**
 * Delivery details, parsed from the same pasted reply as the document fields.
 *
 * These are not part of a service's form_fields — they live on the customer
 * record, because they are how the parcel reaches the person, not what the PSA
 * form asks for. Keys are prefixed so they cannot collide with a document
 * field: a PSA form already has its own `birth_city` and `birth_province`, and
 * "Province:" means a different thing under a birth block than under a
 * delivery block.
 */
export const DELIVERY_PREFIX = "delivery_";

export const DELIVERY_FIELDS: FormFieldDef[] = [
  {
    key: "delivery_name",
    label: "Receiver name",
    type: "text",
    required: false,
    synonyms: [
      "receiver name", "receiver", "name of receiver", "recipient",
      "recipient name", "consignee", "pangalan ng tatanggap", "tatanggap",
      // Generic inside a delivery block, where they can only mean the
      // receiver. Gated by DELIVERY_ONLY_IN_BLOCK so "LAST NAME" in the
      // owner's section is never mistaken for one.
      "name", "full name", "complete name", "pangalan", "buong pangalan",
    ],
  },
  {
    key: "delivery_phone",
    label: "Mobile number",
    type: "text",
    required: false,
    synonyms: [
      "contact number", "contact no", "cellphone number", "cellphone",
      "cell number", "cp number", "cp no", "cp", "mobile number", "mobile",
      "phone number", "phone", "number", "numero", "contact",
      "gcash number", "viber",
    ],
  },
  {
    key: "delivery_address_line",
    label: "Address line",
    type: "text",
    required: false,
    synonyms: [
      "address", "complete address", "full address", "delivery address",
      "shipping address", "house number", "house no", "street", "purok",
      "sitio", "blk", "block", "lot", "tirahan", "bahay",
    ],
  },
  {
    key: "delivery_barangay",
    label: "Barangay",
    type: "text",
    required: false,
    synonyms: ["barangay", "brgy", "bgy", "baranggay"],
  },
  {
    key: "delivery_city",
    label: "City / Municipality",
    type: "text",
    required: false,
    synonyms: ["city", "municipality", "bayan", "town", "lungsod"],
  },
  {
    key: "delivery_province",
    label: "Province",
    type: "text",
    required: false,
    synonyms: ["province", "probinsya", "probinsiya"],
  },
  {
    key: "delivery_zip",
    label: "ZIP code",
    type: "text",
    required: false,
    synonyms: ["zip", "zip code", "postal code", "zipcode", "postcode"],
  },
  {
    key: "delivery_messenger",
    label: "Messenger name",
    type: "text",
    required: false,
    synonyms: ["messenger", "messenger name", "fb name", "facebook name", "fb"],
  },
];

/**
 * "City" and "Province" alone are ambiguous — a PSA birth form asks for both,
 * and so does an address. They only count as delivery details inside a
 * delivery block; elsewhere the document's own fields win.
 */
export const DELIVERY_ONLY_IN_BLOCK = new Set([
  "delivery_city",
  "delivery_province",
  // "Name:" on its own is the applicant's on a PSA form and the receiver's in
  // an address; only the block it sits in decides which.
  "delivery_name",
]);

/** The reverse: a birth place is never a delivery address. */
export const NEVER_IN_DELIVERY_BLOCK = new Set([
  "birth_city",
  "birth_province",
  "birth_country",
]);

/** Parsed delivery keys → the columns they are stored in on `customers`. */
export const DELIVERY_TO_CUSTOMER: Record<string, string> = {
  delivery_name: "full_name",
  delivery_phone: "phone",
  delivery_address_line: "address_line",
  delivery_barangay: "barangay",
  delivery_city: "city",
  delivery_province: "province",
  delivery_zip: "zip",
  delivery_messenger: "messenger_name",
};
