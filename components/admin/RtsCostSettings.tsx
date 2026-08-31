"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, ShieldAlert, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { peso } from "@/lib/money";
import { toMessage, unwrap } from "@/lib/action-result";
import { updateRtsCosts } from "@/lib/actions/settings";

export interface RtsCosts {
  processing: string;
  shipping: string;
  commission: string;
  ad: string;
}

const PARTS: { key: keyof RtsCosts; label: string; hint: string }[] = [
  {
    key: "processing",
    label: "Processing",
    hint: "PSA fee and encoding — already paid before the parcel ships",
  },
  {
    key: "shipping",
    label: "Shipping",
    hint: "The courier bills for the trip out and the trip back",
  },
  {
    key: "commission",
    label: "Commission",
    hint: "The agent's cut, earned when the order was booked",
  },
  {
    key: "ad",
    label: "Ad cost",
    hint: "What it cost to win this order in the first place",
  },
];

/**
 * What a returned parcel costs, broken into the four things the money went on.
 *
 * The total is charged per document rather than per order, because an order
 * for three certificates burns three lots of processing, and the courier
 * charges for the weight it carried.
 */
export function RtsCostSettings({
  initial,
  canEdit,
}: {
  initial: RtsCosts;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  // Shown live as the boxes are typed in, so the figure that will land on the
  // dashboard is never a surprise. A half-typed box just counts as nothing.
  const total = PARTS.reduce((sum, p) => {
    const n = Number.parseFloat(v[p.key]);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await updateRtsCosts(v));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Only admins can change these. You can view them here.
        </p>
      )}

      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        <p className="flex items-center gap-2 font-medium text-slate-900">
          <PackageX className="h-4 w-4 text-red-500" /> What a return costs you
        </p>
        <p className="mt-1 text-xs text-slate-500">
          When a parcel comes back you lose the sale, but you are also out the
          money already spent getting it there. That second figure is what the
          dashboard reports as <strong>RTS losses</strong>.
        </p>

        <div className="mt-5 space-y-3">
          {PARTS.map((p) => (
            <div key={p.key} className="sm:flex sm:items-center sm:gap-4">
              <label
                htmlFor={`rts-${p.key}`}
                className="block text-sm font-medium text-slate-800 sm:w-40 sm:shrink-0"
              >
                {p.label}
              </label>
              <div className="mt-1 flex items-center gap-3 sm:mt-0 sm:flex-1">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                    ₱
                  </span>
                  <input
                    id={`rts-${p.key}`}
                    type="text"
                    inputMode="decimal"
                    disabled={!canEdit}
                    value={v[p.key]}
                    onChange={(e) =>
                      setV({ ...v, [p.key]: e.target.value })
                    }
                    className="w-32 rounded-lg border border-slate-200 py-2 pl-7 pr-3 text-sm tabular-nums focus:border-[#2a78d6] focus:outline-none focus:ring-1 focus:ring-[#2a78d6] disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                <span className="text-xs text-slate-500">{p.hint}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Total lost per document
            </p>
            <p className="text-xs text-slate-500">
              Per document, not per order — a parcel of three costs this three
              times.
            </p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-red-600">
            {peso(total)}
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!dirty || pending}>
            <Save className="mr-2 h-4 w-4" />
            {pending ? "Saving…" : "Save"}
          </Button>
          {saved && (
            <span className="text-sm text-emerald-600">
              Saved — the dashboard uses this from now on.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
