import type { Metadata } from "next";
import { getBusinessInfo } from "@/lib/tracking";
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
    <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 pb-10">
      <header className="flex flex-col items-center gap-2 py-6 text-center">
        {business.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={business.logo_url}
            alt={business.business_name}
            className="h-12 w-auto"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
            DA
          </div>
        )}
        <div>
          <p className="text-lg font-bold text-slate-900">
            {business.business_name}
          </p>
          <p className="text-sm text-slate-500">Track your order</p>
        </div>
      </header>

      <TrackingSearch messengerUrl={business.messenger_url} />
    </main>
  );
}
