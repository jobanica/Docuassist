"use client";

import { useMemo, useState } from "react";
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
  Search,
  X,
  IdCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toMessage, unwrap } from "@/lib/action-result";
import { startProcessing, type SupplierQueueRow } from "@/lib/actions/supplier";
import { fmtDate } from "@/lib/dates";
import { copyText } from "@/lib/clipboard";
import { fieldDisplayValue } from "@/lib/form-fields";
import {
  ACCOUNT_TYPE_KEY,
  ACCOUNT_NEW,
  ACCOUNT_EXISTING_KNOWN,
  ACCOUNT_EXISTING_UNKNOWN,
  ID_NUMBER_KEY,
} from "@/lib/id-verification";
import { RequirementFiles } from "./RequirementFiles";
import { DelayPanel } from "./DelayPanel";
import { aging, agingPill, ageLabel } from "@/lib/status";
import type { FormFieldDef, StatusCode } from "@/lib/types";

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

  const [q, setQ] = useState("");
  const [doc, setDoc] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Every document actually on the board, so the picker never offers a
  // service this supplier has never been given.
  const docNames = useMemo(
    () =>
      Array.from(
        new Set(rows.flatMap((r) => r.items.map((i) => i.service_name)))
      ).sort(),
    [rows]
  );

  const filtered = useMemo(
    () => rows.filter((r) => matches(r, q, doc, from, to)),
    [rows, q, doc, from, to]
  );
  const hidden = rows.length - filtered.length;
  const filtering = Boolean(q.trim() || doc !== "all" || from || to);

  function clearFilters() {
    setQ("");
    setDoc("all");
    setFrom("");
    setTo("");
  }

  const waiting = filtered.filter((r) => r.status === "details_received");
  const started = filtered.filter((r) => r.status === "processing");
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

      <QueueFilters
        q={q}
        onQ={setQ}
        doc={doc}
        onDoc={setDoc}
        docNames={docNames}
        from={from}
        onFrom={setFrom}
        to={to}
        onTo={setTo}
        hidden={hidden}
        filtering={filtering}
        onClear={clearFilters}
      />

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

/**
 * Does this job survive the filter bar?
 *
 * The search runs over everything on the card, the encoded details included:
 * the supplier is as likely to be holding a TIN number or a phone number they
 * are trying to place as a customer's name.
 *
 * The dates are matched against when the request came in, not when it was
 * picked up, so one range means the same thing in both lanes.
 */
function matches(
  r: SupplierQueueRow,
  q: string,
  doc: string,
  from: string,
  to: string
): boolean {
  if (doc !== "all" && !r.items.some((i) => i.service_name === doc)) {
    return false;
  }
  // created_at is a timestamp; the pickers give plain dates, and the "to" day
  // is inclusive — someone filtering a single day expects that day's jobs.
  const day = (r.created_at ?? "").slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;

  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    r.customer_name,
    r.tracking_code,
    r.phone,
    r.messenger_name,
    r.address_line,
    r.barangay,
    r.city,
    r.province,
    ...r.items.flatMap((i) => [
      i.service_name,
      ...Object.values(i.form_details ?? {}),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

/**
 * Narrowing the board.
 *
 * A supplier with forty jobs on the board is looking for one of them — the
 * name a customer just messaged about, or everything that came in on Monday.
 * Client-side, because the whole queue is already here and a round trip per
 * keystroke would be slower than the filtering.
 */
function QueueFilters({
  q,
  onQ,
  doc,
  onDoc,
  docNames,
  from,
  onFrom,
  to,
  onTo,
  hidden,
  filtering,
  onClear,
}: {
  q: string;
  onQ: (v: string) => void;
  doc: string;
  onDoc: (v: string) => void;
  docNames: string[];
  from: string;
  onFrom: (v: string) => void;
  to: string;
  onTo: (v: string) => void;
  hidden: number;
  filtering: boolean;
  onClear: () => void;
}) {
  const field =
    "h-9 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-900";
  return (
    <div className="rounded-xl bg-white p-3 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[13rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Search name, tracking code, TIN, phone…"
            className={`${field} w-full pl-8`}
          />
        </div>
        <select
          value={doc}
          onChange={(e) => onDoc(e.target.value)}
          className={`${field} min-w-0 flex-1 sm:flex-none`}
          aria-label="Document"
        >
          <option value="all">All documents</option>
          {docNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {/* Takes its own full-width row on a phone: two date inputs and their
            labels do not fit beside the document picker, and a "to" field
            running off the edge is one the supplier cannot reach. */}
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <span className="shrink-0 text-xs text-slate-500">Received</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => onFrom(e.target.value)}
            className={`${field} min-w-0 flex-1 sm:flex-none`}
            aria-label="Received from"
          />
          <span className="shrink-0 text-xs text-slate-400">to</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => onTo(e.target.value)}
            className={`${field} min-w-0 flex-1 sm:flex-none`}
            aria-label="Received to"
          />
        </div>
        {filtering && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>
      {filtering && hidden > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {hidden} job{hidden === 1 ? "" : "s"} hidden by the filter.
        </p>
      )}
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

        {/* New or existing decides the whole job — whether the supplier
            registers this person or looks up an account they already have —
            so it sits above the dates and the ageing pill. */}
        {row.items.map((i) => (
          <AccountBadge key={i.item_id} item={i} />
        ))}

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
        <dl className="text-xs">
          {filled.map((f) => (
            <CopyLine
              key={f.key}
              label={f.label}
              value={fieldDisplayValue(f, details[f.key])}
            />
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * One field, copied on its own.
 *
 * The supplier re-keys every one of these into the BIR or PhilHealth form, and
 * a surname typed by eye off a phone screen is where the misspellings come
 * from — the kind that get an application rejected weeks later. So each line
 * is its own button: tap it, paste it, move on.
 *
 * The icon stays visible rather than appearing on hover, because there is no
 * hover on the phone this is used from.
 */
function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  }

  return (
    <div className="flex items-start justify-between gap-2 rounded py-1">
      <dt className="shrink-0 pt-0.5 text-slate-500">{label}</dt>
      <dd className="min-w-0">
        <button
          type="button"
          onClick={copy}
          title={`Copy ${label}`}
          aria-label={`Copy ${label}: ${value}`}
          className={`flex w-full items-start gap-1.5 rounded px-1.5 py-0.5 text-right transition-colors ${
            copied ? "bg-emerald-50" : "hover:bg-slate-100 active:bg-slate-200"
          }`}
        >
          <span
            className={`min-w-0 flex-1 break-words font-medium ${
              copied ? "text-emerald-800" : "text-slate-900"
            }`}
          >
            {value}
          </span>
          {copied ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          ) : (
            <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
          )}
        </button>
      </dd>
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
  filled: FormFieldDef[];
  details: Record<string, string>;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = [
      item.service_name,
      ...filled.map((f) => `${f.label}: ${fieldDisplayValue(f, details[f.key])}`),
    ].join("\n");
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
      <p className="mb-1 font-semibold uppercase tracking-wide text-slate-500">
        Customer
      </p>
      {/* Copyable for the same reason the fields are: a phone number or a
          barangay typed by eye is a delivery that goes to the wrong place. */}
      <dl>
        {row.phone && <CopyLine label="Phone" value={row.phone} />}
        {row.messenger_name && (
          <CopyLine label="Messenger" value={row.messenger_name} />
        )}
        {address && <CopyLine label="Address" value={address} />}
      </dl>
    </div>
  );
}

/**
 * New account, or one they already have.
 *
 * The single most important thing on a TIN or PhilHealth card, and the one the
 * supplier had no way of seeing: filing an existing account as a new
 * registration gets it bounced, and looking up a number nobody paid to have
 * looked up is unpaid work. So all three answers say plainly what to do, and
 * the number comes with the badge rather than being buried in the details.
 */
function AccountBadge({ item }: { item: SupplierQueueRow["items"][number] }) {
  const answer = (item.form_details?.[ACCOUNT_TYPE_KEY] ?? "").trim();
  if (!answer) return null;

  const numberKey = ID_NUMBER_KEY[item.service_code];
  const number = String(item.form_details?.[numberKey] ?? "").trim();

  const look = {
    [ACCOUNT_NEW]: {
      text: "New application",
      hint: "Register from scratch.",
      cls: "border-sky-200 bg-sky-50 text-sky-900",
    },
    [ACCOUNT_EXISTING_KNOWN]: {
      text: "Existing account",
      hint: number
        ? "Do not register again — use the number."
        : "Existing account, but no number was recorded. Ask the office.",
      cls: "border-amber-200 bg-amber-50 text-amber-900",
    },
    [ACCOUNT_EXISTING_UNKNOWN]: {
      text: "Existing — number to be verified",
      hint: "Look the number up at the agency. The customer has paid for this.",
      cls: "border-violet-200 bg-violet-50 text-violet-900",
    },
  }[answer];
  if (!look) return null;

  return (
    <div className={`mt-2 rounded-lg border px-2.5 py-2 text-xs ${look.cls}`}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
        <IdCard className="h-3.5 w-3.5 shrink-0" />
        {item.service_name}: {look.text}
        {number && (
          <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono font-bold">
            {number}
          </span>
        )}
      </p>
      <p className="mt-0.5 opacity-80">{look.hint}</p>
    </div>
  );
}
