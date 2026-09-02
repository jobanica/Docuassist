import { CalendarCheck, PackageCheck, Undo2, Clock } from "lucide-react";
import {
  fmtDate,
  fmtWeekday,
  daysUntilManila,
  dateOnlyManila,
} from "@/lib/dates";
import type { TrackingInfo } from "@/lib/tracking";

/**
 * The one thing a customer opens this link to find out: when it arrives.
 *
 * It sits above everything else and is the loudest element on the page,
 * because "kailan po darating?" is the question every tracking link is really
 * answering — and the one that otherwise comes back as a Messenger message
 * someone has to type a reply to.
 *
 * A date that has already passed is never shown as "3 days late". The estimate
 * is ours and it slips; saying "arriving soon" is both true and the thing that
 * keeps them from worrying, while the status below still tells them exactly
 * where the order is.
 */
export function ArrivalHero({ info }: { info: TrackingInfo }) {
  const card = (
    tone: string,
    eyebrow: string,
    Icon: typeof CalendarCheck,
    big: string,
    sub: string
  ) => (
    <section
      className={`rounded-2xl px-5 py-7 text-center shadow-[0_8px_28px_rgba(16,24,40,0.16)] ${tone}`}
    >
      <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] opacity-75">
        <Icon className="h-3.5 w-3.5" />
        {eyebrow}
      </p>
      <p className="mt-2.5 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
        {big}
      </p>
      {sub && <p className="mt-2 text-sm font-medium opacity-85">{sub}</p>}
    </section>
  );

  if (info.status === "delivered") {
    const when = info.delivered_at;
    const d = daysUntilManila(dateOnlyManila(when));
    const rel =
      d === 0 ? "today" : d === -1 ? "yesterday" : d !== null && d < 0 ? `${-d} days ago` : "";
    return card(
      "bg-gradient-to-br from-[#6DBE45] to-[#3F8F2B] text-white",
      "Delivered",
      PackageCheck,
      when ? fmtDate(when) : "Delivered",
      [fmtWeekday(when), rel].filter(Boolean).join(" · ")
    );
  }

  if (info.status === "returned") {
    return card(
      "bg-gradient-to-br from-rose-500 to-rose-600 text-white",
      "Returned to sender",
      Undo2,
      info.returned_at ? fmtDate(info.returned_at) : "Returned",
      "Message us and we'll arrange another delivery."
    );
  }

  if (info.status === "cancelled") {
    return card(
      "bg-gradient-to-br from-slate-500 to-slate-600 text-white",
      "Order cancelled",
      Undo2,
      "Cancelled",
      "Message us if this wasn't expected."
    );
  }

  const eta = info.expected_delivery_date;
  if (!eta) {
    // Before processing starts there is no honest date to give, and inventing
    // one is worse than saying so.
    return card(
      "bg-gradient-to-br from-[#0F3A66] to-[#1E6FA8] text-white",
      "Estimated arrival",
      Clock,
      "Being confirmed",
      "We'll set the date as soon as we start processing your request."
    );
  }

  const days = daysUntilManila(eta);
  const rel =
    days === null
      ? ""
      : days > 1
        ? `in ${days} days`
        : days === 1
          ? "tomorrow"
          : days === 0
            ? "today"
            : "arriving soon";

  return card(
    "bg-gradient-to-br from-[#0F3A66] to-[#1E6FA8] text-white",
    "Estimated arrival",
    CalendarCheck,
    fmtDate(eta),
    [fmtWeekday(eta), rel].filter(Boolean).join(" · ")
  );
}
