"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Pencil } from "lucide-react";
import { PROVINCES, citiesOf, findCity, matches, type City } from "@/lib/psgc";

/* ---------------------------------------------------------------------------
   One field: type to narrow, tap to choose, or keep what you typed.

   Deliberately not a <select>. There are 1,634 municipalities and some cities
   have 900 barangays — scrolling a native picker to "Tondo" is worse than
   typing three letters. But it still behaves like a select in the way that
   matters: the arrow says "there is a list here", and tapping opens it.
--------------------------------------------------------------------------- */
function Combo({
  label,
  value,
  onChange,
  options,
  placeholder,
  loading = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (name: string) => void;
  options: string[];
  placeholder?: string;
  loading?: boolean;
  /** Shown under the field — why the list is empty, usually. */
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);

  // Tapping anywhere else closes the list. Without this the list stays open
  // behind the next field on a phone and covers what you are typing.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  // Capped: a thousand <li>s is a janky scroll on a cheap phone, and nobody
  // reads past the first screenful — they type instead.
  const shown = useMemo(() => {
    const hits = options.filter((o) => matches(o, query));
    return { list: hits.slice(0, 80), more: Math.max(0, hits.length - 80) };
  }, [options, query]);

  // What they typed is a real answer too, when the list does not have it.
  const typed = query.trim();
  const offerTyped =
    typed.length >= 2 &&
    !options.some((o) => o.toLowerCase() === typed.toLowerCase());

  function choose(name: string) {
    onChange(name);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={box} className="relative">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <div className="relative mt-1">
        <input
          value={open ? query : value}
          placeholder={value || placeholder || "Type to search…"}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") {
              e.preventDefault();
              if (shown.list.length === 1) choose(shown.list[0]);
              else if (offerTyped) choose(typed);
            }
          }}
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-9 text-base"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : (
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          )}
        </span>
      </div>

      {hint && !open && (
        <p className="mt-1 text-[11px] leading-snug text-slate-400">{hint}</p>
      )}

      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {shown.list.map((o) => (
            <li key={o}>
              <button
                type="button"
                // mousedown, not click: click fires after blur, by which time
                // the list has closed and the tap lands on nothing.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[15px] text-slate-700 hover:bg-slate-50"
              >
                {o === value && (
                  <Check className="h-4 w-4 shrink-0 text-blue-600" />
                )}
                <span className={o === value ? "font-semibold" : ""}>{o}</span>
              </button>
            </li>
          ))}

          {shown.more > 0 && (
            <li className="px-3 py-2 text-xs text-slate-400">
              +{shown.more} more — keep typing to narrow it down
            </li>
          )}

          {offerTyped && (
            <li className="border-t border-slate-100">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(typed);
                }}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-[15px] text-slate-700">
                  Use “<strong>{typed}</strong>”
                  <span className="block text-[11px] text-slate-400">
                    Hindi po sa listahan — we&apos;ll use exactly this.
                  </span>
                </span>
              </button>
            </li>
          )}

          {shown.list.length === 0 && !offerTyped && (
            <li className="px-3 py-3 text-sm text-slate-400">
              {options.length === 0
                ? "Pick the one above this first."
                : "No match — check the spelling, or type it in full."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Province → City / Municipality → Barangay, in that order.

   Province first because it is the only one of the three that fits in a list a
   person can actually scan; everything below it is then a short list instead of
   a guess. Names are what get stored — see lib/psgc.
--------------------------------------------------------------------------- */
export function PlacePicker({
  province,
  city,
  barangay,
  onChange,
  withBarangay = false,
  labels,
  required = false,
}: {
  province: string;
  city: string;
  barangay?: string;
  onChange: (next: {
    province?: string;
    city?: string;
    barangay?: string;
  }) => void;
  withBarangay?: boolean;
  labels?: { province?: string; city?: string; barangay?: string };
  required?: boolean;
}) {
  const star = required ? " *" : "";

  // Worked back out from the stored names, so stepping back into this form
  // finds the lists exactly as they were left.
  const cityList = useMemo(() => citiesOf(province), [province]);
  const cityPlace: City | undefined = useMemo(
    () => findCity(province, city),
    [province, city]
  );
  const cityOptions = useMemo(() => cityList.map((c) => c.name), [cityList]);

  const [brgyOptions, setBrgyOptions] = useState<string[]>([]);
  const [loadingBrgy, setLoadingBrgy] = useState(false);

  useEffect(() => {
    if (!withBarangay || !cityPlace) {
      setBrgyOptions([]);
      return;
    }
    let live = true;
    setLoadingBrgy(true);
    fetch(`/api/psgc/barangays?city=${cityPlace.index}`)
      .then((r) => (r.ok ? r.json() : { names: [] }))
      // A failed fetch is not a dead end: the field still takes what they type.
      .catch(() => ({ names: [] as string[] }))
      .then((j) => {
        if (live) setBrgyOptions(j.names ?? []);
      })
      .finally(() => {
        if (live) setLoadingBrgy(false);
      });
    return () => {
      live = false;
    };
  }, [withBarangay, cityPlace]);

  return (
    <div className="space-y-3">
      <Combo
        label={(labels?.province ?? "Province") + star}
        value={province}
        options={PROVINCES}
        onChange={(v) =>
          // A new province makes the old city and barangay wrong, not just
          // stale — clearing them is the only honest thing to do.
          onChange({ province: v, city: "", barangay: "" })
        }
      />
      <Combo
        label={(labels?.city ?? "City / Municipality") + star}
        value={city}
        options={cityOptions}
        onChange={(v) => onChange({ city: v, barangay: "" })}
        hint={
          province && cityOptions.length === 0
            ? "Wala sa listahan ang province — you can type the city in full."
            : undefined
        }
      />
      {withBarangay && (
        <Combo
          label={(labels?.barangay ?? "Barangay") + star}
          value={barangay ?? ""}
          options={brgyOptions}
          loading={loadingBrgy}
          onChange={(v) => onChange({ barangay: v })}
          hint={
            city && !loadingBrgy && brgyOptions.length === 0
              ? "No list for this city — type your barangay in full."
              : undefined
          }
        />
      )}
    </div>
  );
}
