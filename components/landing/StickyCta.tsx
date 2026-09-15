"use client";

import { useEffect, useState } from "react";
import { MESSENGER_URL, PRICE_FROM } from "@/lib/landing";

/**
 * The CTA that follows you down the page, on phones only.
 *
 * Ad traffic lands mid-scroll and rarely comes back up, so once the hero's own
 * button has scrolled away there needs to be another one within thumb reach.
 * It stays hidden until then rather than sitting over the hero, where it would
 * cover the headline and read as a pop-up.
 */
export function StickyCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero-cta");
    if (!hero) return;
    const io = new IntersectionObserver(
      ([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur transition-transform duration-200 md:hidden ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      aria-hidden={!show}
    >
      <a
        href={MESSENGER_URL}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={show ? 0 : -1}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E86C7] px-4 py-3.5 text-[15px] font-semibold text-white shadow-lg active:scale-[0.99]"
      >
        <MessengerIcon />
        Order via Messenger — from {PRICE_FROM}
      </a>
    </div>
  );
}

/** Inline so the button costs no extra request. */
export function MessengerIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2C6.2 2 1.8 6.3 1.8 11.9c0 3.2 1.5 6 3.8 7.9v3.9l3.5-1.9c.9.3 1.9.4 2.9.4 5.8 0 10.2-4.3 10.2-9.9S17.8 2 12 2zm1 13.3-2.6-2.8-5.1 2.8 5.6-6 2.7 2.8 5-2.8-5.6 6z" />
    </svg>
  );
}
