/**
 * Everything on the landing page you are likely to edit, in one file.
 *
 * The page itself (app/page.tsx) holds only layout and markup — prices,
 * counts, links, FAQ wording and the proof gallery all live here, so changing
 * a number never means reading through JSX to find it.
 */

/* --- Where every button goes ---------------------------------------------
   One page, one action. The CTA now opens the order form rather than a chat:
   the visitor picks their document, fills it in, checks it back, pays, and
   leaves with a tracking link — without anyone having to answer a message.
   Messenger stays on the page as the way to ask a question, not to order. */
export const ORDER_URL = "/order";

/* NOTE: taken from the Facebook page already saved in your business settings
   (facebook.com/docuassistphil). m.me uses the page's username, so this should
   be right — but open it once on a phone to confirm before you spend on ads. */
export const MESSENGER_URL = "https://m.me/docuassistphil";
export const FACEBOOK_URL = "https://www.facebook.com/docuassistphil";

/* --- Prices ---------------------------------------------------------------
   These are the ONLINE prices — what someone pays on this site, before
   anything is filed. They must match the "Price — online, paid upfront"
   column in Settings → Services, which is what the order form actually
   charges; these constants only paint the page.

   The cash-on-delivery price staff quote when they encode an order by hand is
   a separate, higher figure (Settings → Services, "Price — cash on delivery"),
   because a COD order carries the risk of a parcel that is never accepted.
   Do not put the COD figure here — this page sells the prepaid one. */
export const PRICE_STANDARD = 365;
export const PRICE_CENOMAR = 420;
/** TIN ID and PhilHealth ID — no PSA fee behind these, so they cost less. */
export const PRICE_ID = 275;

/** "from ₱365" — used in the headline, buttons, title tag and OG card. */
export const PRICE_FROM = `₱${PRICE_STANDARD}`;

/* --- Social proof ---------------------------------------------------------
   PLACEHOLDER NUMBERS — replace with your real figures before the ads run.
   Claiming a rating or a count you can't back up is the fastest way to lose
   the trust the rest of the page is built to earn. */
export const PROOF_STATS = {
  rating: "5.0",
  ratingLabel: "Rated 5.0 on Facebook",
  deliveredLabel: "1,000+ documents delivered",
  shippingLabel: "Nationwide shipping",
};

/* --- The proof gallery ----------------------------------------------------
   Add a file to /public/proof/ and one entry here. Nothing else to touch.

   BEFORE YOU UPLOAD — privacy:
   Blur or crop the customer's full name, their exact address, and the waybill
   barcode on every photo. These are real people's civil-registry documents.
   Captions should carry a first name and a city at most. Ask the customer
   before posting a photo of them or their document. */
export type ProofItem = {
  type: "image" | "video";
  src: string;
  /** Videos only: the still shown before playback (an image in /public/proof/). */
  poster?: string;
  caption: string;
  alt: string;
};

export const PROOF_ITEMS: ProofItem[] = [
  // Real customers, filmed by themselves. Faces are already blurred in the
  // source — do not upload an unblurred re-cut of any of these.
  //
  // NOT LISTED: testimonial 07. It is 23 seconds of a Certificate of Live
  // Birth filling the frame, and at web resolution the registry number, the
  // child's date and place of birth, both parents' full names, the mother's
  // age at the birth, and "marriage of parents: not applicable" are all
  // readable. That is a minor's sensitive personal information, and this page
  // is public and indexed. It is deliberately absent, not forgotten — do not
  // add it back without the document itself obscured.
  //
  // Captions: the wording below says only what the footage actually shows.
  // If you know the customer's first name and city AND they are happy to be
  // named, put it here — "Aileen — Cebu City" carries far more weight than
  // "a customer". Never invent one.
  {
    type: "video",
    src: "/proof/testimonial-02.mp4",
    poster: "/proof/testimonial-02.jpg",
    caption: "Unboxing on camera — the PSA certificate inside",
    alt: "A customer opening their delivered parcel",
  },
  {
    type: "video",
    src: "/proof/testimonial-05.mp4",
    poster: "/proof/testimonial-05.jpg",
    caption: "Her PSA certificates, delivered to her door",
    alt: "A customer holding the PSA certificates she received",
  },
  {
    type: "video",
    src: "/proof/testimonial-06.mp4",
    poster: "/proof/testimonial-06.jpg",
    caption: "Documents received — “thank you so much”",
    alt: "A customer showing the documents that arrived",
  },
  {
    type: "video",
    src: "/proof/testimonial-08.mp4",
    poster: "/proof/testimonial-08.jpg",
    caption: "Delivered to the store — “thank you so much”",
    alt: "A customer at his sari-sari store with the parcel that arrived",
  },
  {
    type: "video",
    src: "/proof/testimonial-03.mp4",
    poster: "/proof/testimonial-03.jpg",
    caption: "“Thank you so much” — a customer after hers arrived",
    alt: "A customer thanking DocuAssist PH on camera",
  },
  {
    type: "video",
    src: "/proof/testimonial-01.mp4",
    poster: "/proof/testimonial-01.jpg",
    // Last on purpose: this one carries a burned-in "CASH ON DELIVERY"
    // banner, and this page sells the prepaid route at a lower price. It is
    // still a genuine testimonial, so it stays — but it should not be the
    // first thing a visitor reads, and the caption says which route it was.
    caption: "A cash-on-delivery order, before we opened online ordering",
    alt: "A customer talking about her delivered document",
  },
];

/* --- The wall of thanks -------------------------------------------------
   Real messages, from the page's own inbox and from public comments on the
   Facebook page. Two rules they are held to:

     1. First name + last initial, never the full name. These were sent to a
        business, not published by the sender — except the Facebook ones,
        which were already public and could carry full names if their authors
        are asked. Consistency wins; "Celestino T." reads as a person either
        way, and nobody is identifiable from it.
     2. No city, no order number, no invented detail. Only what was actually
        written, with obvious typos tidied so the line is readable — the
        voice is left alone, because the voice is the proof.

   `source` is shown on the card. Saying which of the two it came from is a
   small honesty that costs nothing and is worth more than a star rating. */
export type ProofQuote = {
  quote: string;
  name: string;
  source: "messenger" | "facebook";
};

export const PROOF_QUOTES: ProofQuote[] = [
  {
    quote:
      "Thank you po ma'am/sir, dumating na po yong PSA ko. Legit po, maraming-maraming salamat po. Godbless po ❤️🙏",
    name: "Celestino T.",
    source: "messenger",
  },
  {
    quote:
      "Salamat sir, dumating na po yung negative birth ng anak ko. Maraming salamat po sa iyo — maasahan talaga ang serbisyo mo sir.",
    name: "Anghel G.",
    source: "facebook",
  },
  {
    quote: "Salamat po ng marami… proven and tested po, super legit ❤️❤️",
    name: "Ethan G.",
    source: "facebook",
  },
  {
    quote:
      "Maraming salamat po sir, natanggap ko na ang death certificate na ipinadala nyo po sa akin. God bless 🙏❤️",
    name: "Sansue A.",
    source: "messenger",
  },
  {
    quote: "Super legit po, worth it pag-aantay.",
    name: "Vicay C.",
    source: "facebook",
  },
  {
    quote: "Thank you so much po, na-received ko na ang PSA ng anak ko.",
    name: "Airah V.",
    source: "facebook",
  },
  {
    quote: "Ma'am, ok na po. Thank you very much — legit oo talaga kayo.",
    name: "Hemk O.",
    source: "messenger",
  },
  {
    quote: "Salamat po sir, legit. Sana marami pa kayong matulungan.",
    name: "Bryan V.",
    source: "messenger",
  },
  {
    quote: "Na-receive na namin sir/ma'am, thank you so much. God bless.",
    name: "Mike S.",
    source: "messenger",
  },
  {
    quote: "Dumating na sir ang PSA. Thank you!",
    name: "Lailyn R.",
    source: "messenger",
  },
  {
    quote: "Dumating na po yung PSA. Salamat po.",
    name: "Marjorie M.",
    source: "messenger",
  },
  {
    quote: "Maraming salamat. Dumating na po. Salamat po, God bless.",
    name: "Muhammad K.",
    source: "messenger",
  },
  {
    quote: "Na-receive ko na po sir. Maraming salamat po sir 😊",
    name: "Maricel S.",
    source: "messenger",
  },
  {
    quote: "Na-received ko na po ma'am/sir. Salamat po.",
    name: "Loyloy A.",
    source: "messenger",
  },
];

/* --- Raw screenshots ------------------------------------------------------
   Whole, uncropped screenshots of Messenger threads and Facebook comments,
   shown at their own aspect ratio and openable full-size.

   These are published EXACTLY as supplied — that is the point of them, and it
   is what makes them read as unstaged. Which also means whatever is in the
   frame goes on a public, indexed page: the sender's full name and profile
   photo, any certificate legible in their photo, and any of our own tooling
   caught in the shot. Crop before you add one, not after.

   To add: drop the file in /public/proof/screenshots/ and add an entry. Any
   aspect ratio is fine — the wall lays them out in masonry columns. */
export type ProofShot = {
  src: string;
  alt: string;
  /** Optional line under the image. Leave out and the image stands alone. */
  caption?: string;
};

export const PROOF_SCREENSHOTS: ProofShot[] = [];

/* --- FAQ ------------------------------------------------------------------ */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "Legit ba kayo?",
    a: "Yes. Every order gets an official receipt, a personal tracking link showing your document's real-time status, and SMS updates at every stage. You can also check our Facebook page reviews and message us anytime — real humans reply.",
  },
  {
    q: "Bakit payment first?",
    a: "Processing fees are paid to PSA upfront, so we collect payment before we start. In return, you get your receipt + tracking link agad, and we begin processing the same day. Flat pricing — walang dagdag pagdating.",
  },
  {
    q: "Gaano katagal?",
    a: "Processing: 1–2 weeks. Shipping: about 1 week. Total: expect your document within 2–3 weeks, and your tracking link shows exactly which stage it's in.",
  },
  {
    q: "Saan kayo nagde-deliver?",
    a: "Nationwide — Luzon, Visayas, Mindanao. Kahit probinsya.",
  },
  {
    q: "Anong documents ang kaya niyo iprocess?",
    a: `PSA Birth Certificate, CENOMAR, Marriage Certificate, Death Certificate, plus TIN ID and PhilHealth ID assistance at ₱${PRICE_ID}. Lahat po ay maoorder dito sa website.`,
  },
  {
    q: "Paano ako makakabayad?",
    a: "GCash or bank transfer — we show you a QR to scan at the last step of the order form, after you've checked your details. Receipt provided right after payment.",
  },
  {
    q: "Paano ko matratrack ang order ko?",
    a: "Right after you pay, your personal tracking link appears — save it po. Click it anytime to see your document's status; no account or app needed. If you lose it, search your mobile number at /track.",
  },
];
