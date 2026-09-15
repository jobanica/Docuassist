/**
 * Everything on the landing page you are likely to edit, in one file.
 *
 * The page itself (app/page.tsx) holds only layout and markup — prices,
 * counts, links, FAQ wording and the proof gallery all live here, so changing
 * a number never means reading through JSX to find it.
 */

/* --- Where every button goes ---------------------------------------------
   One page, one action: every CTA opens the same Messenger thread.
   NOTE: taken from the Facebook page already saved in your business settings
   (facebook.com/docuassistphil). m.me uses the page's username, so this should
   be right — but open it once on a phone to confirm before you spend on ads. */
export const MESSENGER_URL = "https://m.me/docuassistphil";
export const FACEBOOK_URL = "https://www.facebook.com/docuassistphil";

/* --- Prices ---------------------------------------------------------------
   ⚠️ These are the ad prices. Your CRM currently charges ₱685 for
   birth/marriage/death and ₱735 for CENOMAR. Make these two agree before the
   ads run, or customers arrive quoting a price your staff can't honour. */
export const PRICE_STANDARD = 365;
export const PRICE_CENOMAR = 420;

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
  // PLACEHOLDER — replace with real delivery photos/videos
  { type: "image", src: "/proof/placeholder-1.svg", caption: "PSA Birth Certificate → Cebu City ✓ Delivered", alt: "Delivered parcel placeholder" },
  // PLACEHOLDER — replace with real delivery photos/videos
  { type: "image", src: "/proof/placeholder-2.svg", caption: "CENOMAR → Davao City ✓ Delivered", alt: "Delivered parcel placeholder" },
  // PLACEHOLDER — replace with real delivery photos/videos
  { type: "image", src: "/proof/placeholder-3.svg", caption: "Marriage Certificate → Quezon City ✓ Delivered", alt: "Delivered parcel placeholder" },
  // PLACEHOLDER — replace with real delivery photos/videos
  { type: "image", src: "/proof/placeholder-4.svg", caption: "PSA Birth Certificate → Iloilo ✓ Delivered", alt: "Delivered parcel placeholder" },
  // PLACEHOLDER — replace with real delivery photos/videos
  { type: "image", src: "/proof/placeholder-5.svg", caption: "Death Certificate → Cagayan de Oro ✓ Delivered", alt: "Delivered parcel placeholder" },
  // PLACEHOLDER — a video entry, wired and ready. Drop in an mp4 + a poster
  // image and flip the src/poster; nothing else changes.
  { type: "video", src: "", poster: "/proof/placeholder-6.svg", caption: "Unboxing from a customer in Baguio", alt: "Customer video placeholder" },
];

/* --- Short quotes mixed into the gallery ---------------------------------
   PLACEHOLDER — replace with real Messenger feedback (first name + city). */
export const PROOF_QUOTES: { quote: string; name: string }[] = [
  { quote: "Dumating na po kanina, salamat! Ang bilis, hindi pa ako umalis ng bahay.", name: "Marites — Cebu" },
  { quote: "Legit po sila. May tracking link talaga, nakita ko bawat status.", name: "Jun — Davao" },
];

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
    a: "PSA Birth Certificate, CENOMAR, Marriage Certificate, Death Certificate. We also assist with TIN ID and PhilHealth ID — chat us.",
  },
  {
    q: "Paano ako makakabayad?",
    a: "GCash or bank transfer. Receipt provided right after payment.",
  },
  {
    q: "Paano ko matratrack ang order ko?",
    a: "After ordering, you'll get a personal tracking link (and QR code). Click it anytime to see your document's status — no account or app needed.",
  },
];
