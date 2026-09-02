import { MessageCircle, ShieldCheck } from "lucide-react";
import { BrandLogo } from "./BrandLogo";

/**
 * The frame both tracking pages sit in.
 *
 * One shell rather than two so the private link and the public search look
 * like the same company — a customer who arrives by either route should not
 * feel they have landed somewhere else. The navy band carries the brand and
 * gives the white cards something to sit against; everything below is a single
 * narrow column, because this is opened on a phone from Messenger nearly every
 * time.
 */
export function TrackShell({
  business,
  subtitle,
  children,
  messengerUrl,
  messengerName,
}: {
  business: { business_name: string; logo_url: string | null };
  subtitle: string;
  children: React.ReactNode;
  /** Footer "message us" target — the page named on the order, when there is one. */
  messengerUrl?: string | null;
  messengerName?: string | null;
}) {
  return (
    <main className="min-h-screen bg-slate-100">
      {/* Brand band. The content below overlaps it, so the first card reads as
          part of the header rather than floating under a coloured strip. */}
      <div className="bg-gradient-to-b from-[#1e3a5f] to-[#25496f] pb-16 pt-8">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 text-center">
          <BrandLogo src={business.logo_url} name={business.business_name} />
          <div>
            <p className="text-lg font-bold tracking-tight text-white">
              {business.business_name}
            </p>
            <p className="mt-0.5 text-sm text-white/70">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-12 max-w-md px-4 pb-12">
        {children}

        <footer className="mt-8 space-y-4">
          {messengerUrl && (
            <div className="text-center">
              <p className="text-sm text-slate-500">May tanong po kayo?</p>
              <a
                href={messengerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#2a78d6] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2467b8]"
              >
                <MessageCircle className="h-4 w-4" />
                {messengerName ? `Message ${messengerName}` : "Message us on Facebook"}
              </a>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl bg-white/70 px-3.5 py-3 text-xs leading-relaxed text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              We protect your personal data under the{" "}
              <span className="font-medium text-slate-600">
                Data Privacy Act of 2012
              </span>
              . This page shows the name on each document you requested and
              where your order has reached — never your address, contact
              number, or anything else on your form.
            </span>
          </div>

          <p className="text-center text-[11px] text-slate-400">
            © {new Date().getFullYear()} {business.business_name}
          </p>
        </footer>
      </div>
    </main>
  );
}
