import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BrandLogo } from "@/components/track/BrandLogo";
import { getLandingBranding } from "@/lib/landing-data";

/**
 * The frame both legal pages share.
 *
 * They open in a new tab from a checkbox on the last screen before payment, so
 * they have to look like the same company the customer was two seconds ago — a
 * bare wall of text on a white page is exactly what a scam looks like, and
 * this is the moment someone is deciding whether we are one.
 */
export async function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** Shown under the title so a reader can see how current this is. */
  updated: string;
  children: React.ReactNode;
}) {
  const business = await getLandingBranding();

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-5 pb-16">
        <header className="flex flex-col items-center gap-3 py-8 text-center">
          <Link href="/">
            <BrandLogo
              src={business.logo_url}
              name={business.business_name}
              lockup={business.logo_includes_name}
            />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#14406F]">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {business.business_name} · Last updated {updated}
            </p>
          </div>
        </header>

        <article
          className="
            rounded-2xl bg-white p-6 shadow-sm
            [&_a]:font-medium [&_a]:text-[#1E86C7] [&_a]:underline
            [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-[15px] [&_h2]:font-bold
            [&_h2]:uppercase [&_h2]:tracking-[0.1em] [&_h2]:text-[#14406F]
            [&_h2:first-child]:mt-0
            [&_li]:mb-1.5 [&_li]:leading-relaxed [&_li]:text-slate-700
            [&_p]:mb-3 [&_p]:leading-relaxed [&_p]:text-slate-700
            [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5
          "
        >
          {children}
        </article>

        <Link
          href="/order"
          className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#14406F] shadow-sm transition hover:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to my order
        </Link>
      </div>
    </main>
  );
}
