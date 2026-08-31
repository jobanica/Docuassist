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
  AlertTriangle,
  Inbox,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toMessage, unwrap } from "@/lib/action-result";
import { startProcessing, type SupplierQueueRow } from "@/lib/actions/supplier";
import { fmtDate } from "@/lib/dates";
import { RequirementFiles } from "./RequirementFiles";
import { DelayPanel } from "./DelayPanel";
import { aging, agingPill, ageLabel } from "@/lib/status";
import type { StatusCode } from "@/lib/types";

/**
 * The supplier's board.
 *
 * Two lanes, because there are exactly two places a job can be while it is
 * theirs: waiting to be picked up, and in their hands. Anything further along
 * has left them — the office records that when the finished IDs arrive — so a
 * third lane would be a column nobody could ever drag into.
 *
 * Deliberately not the orders board: no money, no navigation to anything else.
 */
export function SupplierQueue({ rows }: { rows: SupplierQueueRow[] }) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const waiting = rows.filter((r) => r.status === "details_received");
  const started = rows.filter((r) => r.status === "processing");
  // A job the supplier has flagged, or one that has sat a fortnight, is what
  // the lane header counts — it is the number worth glancing at.
  const needsAttention = started.filter(
    (r) =>
      Boolean(r.delayed_at) ||
      aging(r.status as StatusCode, r.status_since ?? "") === "alert"
  ).length;

  async function move(orderId: string) {
    setError(null);
    setMoving(orderId);
    try {
      unwrap(await startProcessing(orderId));
      router.refresh();
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setMoving(null);
      setDragging(null);
      setOver(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="flex items-start gap-1.5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* --- Lane 1: waiting to be picked up ------------------------------ */}
        <Lane
          title="To start"
          count={waiting.length}
          hint="Drag a card across, or press Start processing."
          tone="sky"
          empty="Nothing waiting. New requests appear here."
          emptyIcon={<Inbox className="h-5 w-5" />}
        >
          {waiting.map((r) => (
            <Card
              key={r.order_id}
              row={r}
              lane="waiting"
              draggable
              isDragging={dragging === r.order_id}
              busy={moving === r.order_id}
              onDragStart={() => setDragging(r.order_id)}
              onDragEnd={() => { setDragging(null); setOver(false); }}
              onStart={() => move(r.order_id)}
            />
          ))}
        </Lane>

        {/* --- Lane 2: in their hands --------------------------------------- */}
        <Lane
          title="In progress"
          count={started.length}
          attention={needsAttention}
          hint="Leaves the board once the finished IDs are received."
          tone="amber"
          empty="Nothing in progress."
          emptyIcon={<Clock className="h-5 w-5" />}
          dropActive={over && dragging !== null}
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();       // without this the drop never fires
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging) move(dragging);
          }}
        >
          {started.map((r) => (
            <Card key={r.order_id} row={r} lane="started" />
          ))}
        </Lane>
      </div>
    </div>
  );
}

const laneTone: Record<string, { bar: string; chip: string }> = {
  sky: { bar: "bg-sky-400", chip: "bg-sky-100 text-sky-800" },
  amber: { bar: "bg-amber-400", chip: "bg-amber-100 text-amber-800" },
};

function Lane({
  title,
  count,
  attention = 0,
  hint,
  tone,
  empty,
  emptyIcon,
  children,
  dropActive = false,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  title: string;
  count: number;
  attention?: number;
  hint: string;
  tone: "sky" | "amber";
  empty: string;
  emptyIcon: React.ReactNode;
  children: React.ReactNode;
  dropActive?: boolean;
  onDragOver?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
}) {
  const t = laneTone[tone];
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex flex-col rounded-2xl border-2 border-dashed p-3 transition-colors ${
        dropActive
          ? "border-[#2a78d6] bg-[#2a78d6]/5"
          : "border-transparent bg-slate-100/70"
      }`}
    >
      <div className="mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${t.bar}`} />
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.chip}`}
          >
            {count}
          </span>
          {attention > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              <AlertTriangle className="h-3 w-3" />
              {attention}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-white/70 py-10 text-center text-sm text-slate-400">
            {emptyIcon}
            <span>{empty}</span>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function Card({
  row,
  lane,
  draggable = false,
  isDragging = false,
  busy = false,
  onDragStart,
  onDragEnd,
  onStart,
}: {
  row: SupplierQueueRow;
  lane: "waiting" | "started";
  draggable?: boolean;
  isDragging?: boolean;
  busy?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onStart?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const docs = row.items.map((i) => i.service_name).join(", ");
  const age = aging(row.status as StatusCode, row.status_since ?? "");
  const isDelayed = Boolean(row.delayed_at);
  const flagged = isDelayed || age === "alert";

  return (
    <article
      draggable={draggable && !busy}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Firefox will not start a drag without something on the transfer.
        e.dataTransfer.setData("text/plain", row.order_id);
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      className={`rounded-xl bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-opacity ${
        isDragging ? "opacity-40" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${
        flagged
          ? "border-l-4 border-red-500"
          : age === "warn"
            ? "border-l-4 border-amber-400"
            : ""
      }`}
    >
      <div className="p-3.5">
        <div className="flex items-start gap-2">
          {draggable && (
            <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">
              {row.customer_name}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {docs} · <span className="font-mono">{row.tracking_code}</span>
            </p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {lane === "started" ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${agingPill[age]}`}
            >
              {age !== "none" && <AlertTriangle className="h-3 w-3" />}
              {ageLabel(row.status_since)} with you
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              received {fmtDate(row.created_at)}
            </span>
          )}
          {isDelayed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              <AlertTriangle className="h-3 w-3" /> Delayed
            </span>
          )}
          {row.items.some((i) => (i.files ?? []).length > 0) && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              {row.items.reduce((n, i) => n + (i.files ?? []).length, 0)} file
              {row.items.reduce((n, i) => n + (i.files ?? []).length, 0) === 1
                ? ""
                : "s"}
            </span>
          )}
        </div>

        {lane === "waiting" && (
          <Button
            size="sm"
            className="mt-3 w-full"
            disabled={busy}
            onClick={onStart}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Starting…
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" /> Start processing
              </>
            )}
          </Button>
        )}

        {lane === "started" && (
          <div className="mt-3">
            <DelayPanel
              orderId={row.order_id}
              delayedAt={row.delayed_at}
              reason={row.delay_reason}
              files={row.delay_files ?? []}
            />
          </div>
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
      </div>

      {open && (
        <div className="space-y-3 border-t bg-slate-50/60 p-3.5">
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
    </article>
  );
}

function ItemFields({ item }: { item: SupplierQueueRow["items"][number] }) {
  const details = item.form_details ?? {};
  const filled = (item.form_fields ?? []).filter((f) =>
    String(details[f.key] ?? "").trim()
  );

  return (
    <div className="rounded-lg bg-white p-3">
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
        <dl className="space-y-1.5 text-xs">
          {filled.map((f) => (
            <div key={f.key} className="flex justify-between gap-3">
              <dt className="shrink-0 text-slate-500">{f.label}</dt>
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
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
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
    <div className="rounded-lg border border-dashed bg-white p-3 text-xs">
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
