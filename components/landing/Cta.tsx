"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ORDER_URL, PRICE_FROM } from "@/lib/landing";

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
        href={ORDER_URL}
        tabIndex={show ? 0 : -1}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#14406F] px-4 py-3.5 text-[15px] font-semibold text-white shadow-lg active:scale-[0.99]"
      >
        Start my order — from {PRICE_FROM}
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}
