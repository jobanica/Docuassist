import type { Metadata } from "next";
import { getBusinessInfo } from "@/lib/tracking";
import { TrackShell } from "@/components/track/TrackShell";
import { TrackingSearch } from "@/components/track/TrackingSearch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track your order · DocuAssist PH",
  description: "Search your document orders by phone number.",
  robots: { index: false, follow: false },
};

/**
 * The centralized tracking page.
 *
 * A second way in beside the private per-order link: a customer types their
 * phone number and sees all their orders, each opening its own tracking page.
 * The lookup is phone-keyed on purpose — see 0045 — so a name alone can't
 * surface someone else's documents.
 */
export default async function TrackSearchPage() {
  const business = await getBusinessInfo();

  return (
    <TrackShell
      business={business}
      subtitle="Check your document status"
      messengerUrl={business.messenger_url}
    >
      <TrackingSearch />
    </TrackShell>
  );
}
