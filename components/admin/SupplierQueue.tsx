"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Copy,
  Check,
  PlayCircle,
  Clock,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toMessage, unwrap } from "@/lib/action-result";
import { startProcessing, type SupplierQueueRow } from "@/lib/actions/supplier";
import { fmtDate } from "@/lib/dates";
import { RequirementFiles } from "./RequirementFiles";

/**
 * The supplier's work list.
 *
 * Deliberately not the orders board: no money, no pipeline, no navigation to
 * anything else. There are two things to do here — read the applicant's
 * details, and say the work has started.
 */
export function SupplierQueue({ rows }: { rows: SupplierQueueRow[] }) {
  const waiting = rows.filter((r) => r.status === "details_received");
  const started = rows.filter((r) => r.status === "processing");

  return (
    <div className="space-y-6">
      <Section
        title="To start"
        hint="Press Start processing once you have begun the application."
        empty="Nothing waiting. New requests appear here."
        rows={waiting}
        canStart
      />
      <Section
        title="In progress"
        hint="Still with you. These leave the list once the finished IDs are received."
        empty="Nothing in progress."
        rows={started}
        canStart={false}
      />
    </div>
  );
}

function Section({
  title,
  hint,
  empty,
  rows,
  canStart,
}: {
  title: string;
  hint: string;
  empty: string;
  rows: SupplierQueueRow[];
  canStart: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">
          {title}{" "}
          <span className="text-sm font-normal text-slate-400">
            ({rows.length})
          </span>
        </h2>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <OrderCard key={r.order_id} row={r} canStart={canStart} />
          ))}
        </div>
      )}
    </section>
  );
}

function OrderCard({
  row,
  canStart,
}: {
  row: SupplierQueueRow;
  canStart: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function start() {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await startProcessing(row.order_id));
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  const docs = row.items.map((i) => i.service_name).join(", ");

  return (
    <div className="rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{row.customer_name}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {docs} · <span className="font-mono">{row.tracking_code}</span> ·
            received {fmtDate(row.created_at)}
          </p>
        </div>
        {canStart ? (
          <Button size="sm" onClick={start} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Starting…
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" /> Start processing
              </>
            )}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
            <Clock className="h-3.5 w-3.5" /> In progress
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-xs font-medium hover:bg-accent/40"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        Application details
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {row.items.map((item) => (
            <div key={item.item_id} className="space-y-2">
              <ItemFields item={item} />
              {/* Read-only: the requirements travel with the job, but the
                  office is who collects them from the customer. */}
              <RequirementFiles
                itemId={item.item_id}
                orderId={row.order_id}
                initial={item.files ?? []}
                canEdit={false}
              />
            </div>
          ))}
          <Delivery row={row} />
        </div>
      )}
    </div>
  );
}

function ItemFields({ item }: { item: SupplierQueueRow["items"][number] }) {
  const details = item.form_details ?? {};
  const filled = (item.form_fields ?? []).filter((f) =>
    String(details[f.key] ?? "").trim()
  );

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {item.service_name}
          {item.quantity > 1 && ` × ${item.quantity}`}
        </p>
        <CopyAll item={item} filled={filled} details={details} />
      </div>

      {filled.length === 0 ? (
        <p className="text-xs text-slate-500">
          Nothing filled in yet — the details are still being collected.
        </p>
      ) : (
        <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
          {filled.map((f) => (
            <div key={f.key} className="flex justify-between gap-3">
              <dt className="text-slate-500">{f.label}</dt>
              <dd className="text-right font-medium text-slate-900">
                {details[f.key]}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** One press puts the whole application on the clipboard, ready to re-key. */
function CopyAll({
  item,
  filled,
  details,
}: {
  item: SupplierQueueRow["items"][number];
  filled: { key: string; label: string }[];
  details: Record<string, string>;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = [
      item.service_name,
      ...filled.map((f) => `${f.label}: ${details[f.key]}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the fields are on screen to read */
    }
  }

  if (filled.length === 0) return null;
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-white"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> Copy
        </>
      )}
    </button>
  );
}

function Delivery({ row }: { row: SupplierQueueRow }) {
  const address = [row.address_line, row.barangay, row.city, row.province, row.zip]
    .filter((p) => p && String(p).trim())
    .join(", ");
  if (!address && !row.phone && !row.messenger_name) return null;

  return (
    <div className="rounded-lg border border-dashed p-3 text-xs">
      <p className="mb-1.5 font-semibold uppercase tracking-wide text-slate-500">
        Customer
      </p>
      {row.phone && (
        <p className="text-slate-700">
          <span className="text-slate-500">Phone:</span> {row.phone}
        </p>
      )}
      {row.messenger_name && (
        <p className="text-slate-700">
          <span className="text-slate-500">Messenger:</span> {row.messenger_name}
        </p>
      )}
      {address && (
        <p className="mt-0.5 text-slate-700">
          <span className="text-slate-500">Address:</span> {address}
        </p>
      )}
    </div>
  );
}
