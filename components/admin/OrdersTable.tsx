"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  PhoneCall,
  Printer,
  X,
  ArrowRight,
  AlertCircle,
  Tags,
  Combine,
  MessageSquare,
} from "lucide-react";
import { bulkAdvanceStatus, combineOrders } from "@/lib/actions/orders";
import { tagCustomers } from "@/lib/actions/tags";
import type { Tag } from "@/lib/tags";
import { TagChip } from "./TagChip";
import { TagPicker } from "./TagPicker";
import { StatusBadge } from "./StatusBadge";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { peso } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { aging, attemptBadgeClasses, nextStatus } from "@/lib/status";
import type { OrderStatus, Service, StatusCode } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface OrderRow {
  id: string;
  tracking_code: string;
  status: StatusCode;
  status_label: string;
  total_amount: number;
  /** Taken off already; shown so a discounted order is visible on the board. */
  discount_amount: number;
  /** Documents on this order — one delivery covers all of them. */
  document_count: number;
  created_at: string;
  status_since: string;
  delivery_attempts: number;
  /** 'public' = the customer submitted it themselves through the order link. */
  source: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  /** Batch tags on this order's customer. */
  tag_ids: string[];
  /** Staff who encoded it. Null for a customer's own online submission. */
  created_by_id: string | null;
  created_by_name: string | null;
  service_codes: string[];
  service_names: string[];
  /** People named on the documents who aren't the booking customer — shown so
   *  a certificate for someone else is visible on the row. */
  document_owners: string[];
  /** Every name on the documents (owner, spouse, parents), lower-cased, so the
   *  search finds an order by whoever a document is for, not just the customer. */
  document_search: string;
  /** Set by the supplier when a job is held up; the customer sees the reason. */
  delayed_at: string | null;
  delay_reason: string | null;
  /** The supplier has posted the finished ID; the office should release it. */
  id_posted: boolean;
  /** Times this order has been reshipped after a return. 0 = never. */
  reship_count: number;
  /** The customer has asked for a reship that hasn't been done yet. */
  reship_requested: boolean;
  /** Parents'-surname warnings on this order's documents, if any. */
  name_issues: string[];
  /** Supplier notes the office hasn't marked handled — a flag to act on. */
  open_supplier_notes: number;
  /** Reason logged on the most recent failed delivery attempt, if any. */
  last_attempt_note: string | null;
  last_attempt_at: string | null;
}

/**
 * Not a status — a filter for orders a courier failed to deliver and that
 * haven't been returned yet. These are the ones worth phoning: every one
 * recovered before the third attempt is a sale that would otherwise come back.
 */
export const FAILED_ATTEMPTS = "__failed_attempts";

/**
 * Also not a status — the orders whose parents' names break the Philippine
 * rule. Encoding is never blocked on it, deliberately, so these accumulate and
 * have to be found again later. This is how they are found.
 */
export const NAME_MISMATCH = "__name_mismatch";

/** Also not a status — orders the supplier has flagged and nobody has cleared. */
export const SUPPLIER_NOTE = "__supplier_note";

/**
 * Also not a status — orders sent back out after a return. A reshipped order
 * moves on through Released, Shipped and Delivered like any other, so its
 * status no longer says it was ever returned; this is how those are found.
 */
export const RESHIP = "__reship";

/**
 * Also not a status — orders the customer has asked to have reshipped, which
 * hasn't happened yet. These are the ones to act on: some are still coming
 * back, so watch for the parcel and send it straight out when it lands.
 */
export const RESHIP_REQUESTED = "__reship_requested";

function needsCall(o: OrderRow): boolean {
  return o.status === "shipped" && o.delivery_attempts > 0;
}

const agingClasses: Record<string, string> = {
  none: "",
  warn: "bg-amber-50",
  alert: "bg-red-50",
};

export function OrdersTable({
  orders,
  statuses,
  services,
  tags: initialTags,
  shippingFee,
}: {
  orders: OrderRow[];
  statuses: OrderStatus[];
  services: Service[];
  tags: Tag[];
  /** Baked into every price, so one parcel only owes it once. */
  shippingFee: number;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [service, setService] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const router = useRouter();
  // Orders ticked for a batch print. Kept as ids so a filter change doesn't
  // silently drop a selection the staff member already made.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [byFilter, setByFilter] = useState<string>("all");
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [applying, setApplying] = useState<string[]>([]);
  const [tagNote, setTagNote] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagging, startTagging] = useTransition();
  const [confirmMove, setConfirmMove] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, startMove] = useTransition();
  const [confirmCombine, setConfirmCombine] = useState(false);
  const [combineTotal, setCombineTotal] = useState("");
  const [combineError, setCombineError] = useState<string | null>(null);
  const [combining, startCombining] = useTransition();

  const callList = useMemo(() => orders.filter(needsCall), [orders]);
  const nameList = useMemo(
    () => orders.filter((o) => o.name_issues.length > 0),
    [orders]
  );
  const noteList = useMemo(
    () => orders.filter((o) => o.open_supplier_notes > 0),
    [orders]
  );
  const reshipList = useMemo(
    () => orders.filter((o) => o.reship_count > 0),
    [orders]
  );
  const reshipReqList = useMemo(
    () => orders.filter((o) => o.reship_requested),
    [orders]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = orders.filter((o) => {
      if (status === FAILED_ATTEMPTS) {
        if (!needsCall(o)) return false;
      } else if (status === NAME_MISMATCH) {
        if (o.name_issues.length === 0) return false;
      } else if (status === SUPPLIER_NOTE) {
        if (o.open_supplier_notes === 0) return false;
      } else if (status === RESHIP) {
        if (o.reship_count === 0) return false;
      } else if (status === RESHIP_REQUESTED) {
        if (!o.reship_requested) return false;
      } else if (status !== "all" && o.status !== status) return false;
      if (service !== "all" && !o.service_codes.includes(service)) return false;
      if (tagFilter === "untagged" && o.tag_ids.length > 0) return false;
      if (tagFilter !== "all" && tagFilter !== "untagged" &&
          !o.tag_ids.includes(tagFilter)) return false;
      if (byFilter === "public" && o.created_by_id) return false;
      if (byFilter !== "all" && byFilter !== "public" &&
          o.created_by_id !== byFilter) return false;
      if (from && o.created_at.slice(0, 10) < from) return false;
      if (to && o.created_at.slice(0, 10) > to) return false;
      if (needle) {
        // The document names are searchable too, so an order booked under one
        // customer is found by whoever each certificate is actually for.
        const hay =
          `${o.customer_name} ${o.customer_phone ?? ""} ${o.tracking_code} ${o.document_search}`.toLowerCase();
        // Match on any word typed, so "hayana nardo" still finds a row that
        // holds the name — the words can sit in different fields.
        if (!needle.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });

    // On the call list, urgency decides the order: most attempts first (a 2/3
    // is one failure from being returned), then whoever has gone longest since
    // anyone last tried them — the same date the row shows.
    if (status === FAILED_ATTEMPTS) {
      const since = (o: OrderRow) => o.last_attempt_at ?? o.status_since;
      return [...rows].sort(
        (a, b) =>
          b.delivery_attempts - a.delivery_attempts ||
          since(a).localeCompare(since(b))
      );
    }
    return rows;
  }, [orders, q, status, service, from, to, tagFilter, byFilter]);

  const onCallList = status === FAILED_ATTEMPTS;

  /**
   * What a bulk status change would do to the current selection.
   *
   * Orders only move together when they start together: a selection holding
   * two different stages has no single "next", so the move is refused here and
   * again on the server rather than guessed at.
   */
  const bulk = useMemo(() => {
    const rows = orders.filter((o) => picked.has(o.id));
    if (rows.length === 0) return null;
    const present = Array.from(new Set(rows.map((o) => o.status)));
    const labelOf = (code: string) =>
      statuses.find((s) => s.code === code)?.label ?? code;

    if (present.length > 1) {
      return {
        blocked: `Those orders are at different stages (${present
          .map(labelOf)
          .join(", ")}). Select orders that share one status to change them together.`,
      } as const;
    }
    const current = present[0] as StatusCode;
    const target = nextStatus(current);
    if (!target) {
      return { blocked: `${labelOf(current)} has no next stage.` } as const;
    }
    if (target === "shipped") {
      return {
        blocked:
          "Shipping needs a courier and tracking number per order — open each one and use “Mark as Shipped”.",
      } as const;
    }
    if (target === "delivered") {
      return {
        blocked:
          "Marking delivered records the COD collection per order — open each one and use “Mark as Delivered”.",
      } as const;
    }
    return { target, targetLabel: labelOf(target), from: labelOf(current) } as const;
  }, [orders, picked, statuses]);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  /**
   * Who has orders on this board, for the "encoded by" filter.
   *
   * Read off the rows rather than the staff list: a scoped account only sees
   * its own documents, and offering names whose orders it cannot see would be
   * a filter that always returns nothing.
   */
  const encoders = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of orders) {
      if (o.created_by_id && o.created_by_name) {
        seen.set(o.created_by_id, o.created_by_name);
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  /**
   * Tag the customers behind the selected orders.
   *
   * A batch is assembled from orders — this stack goes to the counter today —
   * but the tag belongs to the customer, so the same person keeps their batch
   * however many documents they ordered.
   */
  function applyTag(mode: "add" | "remove") {
    const tagId = applying[0];
    if (!tagId) return;
    const customerIds = Array.from(
      new Set(
        orders
          .filter((o) => picked.has(o.id))
          .map((o) => o.customer_id)
          .filter((v): v is string => Boolean(v))
      )
    );
    setTagError(null);
    setTagNote(null);
    startTagging(async () => {
      const res = await tagCustomers(customerIds, tagId, mode);
      if (!res.ok) {
        setTagError(res.error);
        return;
      }
      const name = tagById.get(tagId)?.name ?? "tag";
      setTagNote(
        mode === "add"
          ? `Tagged ${res.value.changed} customer${res.value.changed === 1 ? "" : "s"} “${name}”.` +
            (res.value.skipped > 0
              ? ` ${res.value.skipped} weren't yours to tag and were left alone.`
              : "")
          : `Removed “${name}” from ${res.value.changed} customer${res.value.changed === 1 ? "" : "s"}.`
      );
      setPicked(new Set());
      setApplying([]);
      router.refresh();
    });
  }

  /**
   * Two orders for one person, made into one job.
   *
   * Offered only when the selection is one customer's and none of it has
   * shipped — after that the parcels are already separate and there is
   * nothing left to combine.
   */
  const combinable = useMemo(() => {
    const rows = orders.filter((o) => picked.has(o.id));
    if (rows.length < 2) return null;
    const customers = new Set(rows.map((o) => o.customer_id));
    if (customers.size > 1) {
      return {
        blocked:
          "Those orders belong to different customers. Combining is for one person's documents going in one parcel.",
      } as const;
    }
    const gone = rows.filter((o) =>
      ["shipped", "delivered", "returned", "cancelled"].includes(o.status)
    );
    if (gone.length > 0) {
      return {
        blocked: `${gone
          .map((o) => o.tracking_code)
          .join(" and ")} already left the office. Orders can be combined up to Released.`,
      } as const;
    }
    const oldest = rows.reduce((a, b) => (a.created_at <= b.created_at ? a : b));
    const subtotal = rows.reduce(
      (sum, o) => sum + o.total_amount + o.discount_amount,
      0
    );
    // Every price is the document plus one trip to the customer. Documents
    // going in one parcel owe one delivery between them, which is the whole
    // reason for combining — so the box opens on that figure rather than
    // making someone work it out each time.
    const docs = rows.reduce((n, o) => n + o.document_count, 0);
    const oneParcel = Math.max(docs - 1, 0) * shippingFee;
    const promised = rows.reduce((sum, o) => sum + o.discount_amount, 0);
    return {
      rows,
      keeper: oldest,
      docs,
      subtotal,
      oneParcel,
      promised,
      suggested: Math.max(subtotal - promised - oneParcel, 0),
    } as const;
  }, [orders, picked]);

  function runCombine() {
    if (!combinable || "blocked" in combinable) return;
    setCombineError(null);
    const asked = combineTotal.trim() === "" ? undefined : Number(combineTotal);
    startCombining(async () => {
      const res = await combineOrders(Array.from(picked), asked);
      if (!res.ok) {
        setCombineError(res.error);
        return;
      }
      setPicked(new Set());
      setConfirmCombine(false);
      setCombineTotal("");
      router.push(`/orders/${res.value.id}`);
    });
  }

  function runBulkMove() {
    setMoveError(null);
    startMove(async () => {
      const res = await bulkAdvanceStatus(Array.from(picked));
      if (!res.ok) {
        setMoveError(res.error);
        setConfirmMove(false);
        return;
      }
      setPicked(new Set());
      setConfirmMove(false);
      router.refresh();
    });
  }

  const shown = filtered.map((o) => o.id);
  const allShownPicked =
    shown.length > 0 && shown.every((id) => picked.has(id));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllShown() {
    setPicked((prev) => {
      const next = new Set(prev);
      if (allShownPicked) shown.forEach((id) => next.delete(id));
      else shown.forEach((id) => next.add(id));
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Standing reminder so the call list is the first thing seen, without
          having to remember to open the filter. */}
      {/* The same standing reminder for the names, because these are the ones
          that were knowingly saved past a warning and would otherwise only
          turn up when the PSA counter rejects them. */}
      {nameList.length > 0 && status !== NAME_MISMATCH && (
        <button
          type="button"
          onClick={() => setStatus(NAME_MISMATCH)}
          className="flex w-full items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100"
        >
          <Users className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <strong>
              {nameList.length} order{nameList.length === 1 ? "" : "s"} with
              parents&apos; names to check
            </strong>{" "}
            — the last name or middle name doesn&apos;t follow the rule. Open
            each one and confirm the names before it is filed.
          </span>
        </button>
      )}

      {/* The supplier holds the TIN/PhilHealth jobs and is the first to see a
          missing detail; this puts the ones they flagged in front of the
          office instead of waiting on someone opening the order. */}
      {noteList.length > 0 && status !== SUPPLIER_NOTE && (
        <button
          type="button"
          onClick={() => setStatus(SUPPLIER_NOTE)}
          className="flex w-full items-center gap-3 rounded-lg border border-[#2a78d6]/40 bg-[#2a78d6]/5 px-4 py-3 text-left text-sm text-[#1e3a5f] hover:bg-[#2a78d6]/10"
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <strong>
              {noteList.length} order{noteList.length === 1 ? "" : "s"} the
              supplier flagged
            </strong>{" "}
            — a missing or unreadable detail on a TIN or PhilHealth job. Open it,
            chase the customer, then mark it handled.
          </span>
          <span className="shrink-0 font-medium underline">Show them</span>
        </button>
      )}

      {callList.length > 0 && !onCallList && (
        <button
          type="button"
          onClick={() => setStatus(FAILED_ATTEMPTS)}
          className="flex w-full items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100"
        >
          <PhoneCall className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <strong>
              {callList.length} order{callList.length === 1 ? "" : "s"} to call
            </strong>{" "}
            — delivery failed and the courier will retry. Reach them before the
            third attempt and it ships again instead of coming back.
          </span>
          <span className="shrink-0 font-medium underline">Show them</span>
        </button>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, or tracking code"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value={FAILED_ATTEMPTS}>
            ⚠ Failed delivery attempts{callList.length ? ` (${callList.length})` : ""}
          </option>
          <option value={NAME_MISMATCH}>
            ⚠ Parents&apos; names to check{nameList.length ? ` (${nameList.length})` : ""}
          </option>
          <option value={SUPPLIER_NOTE}>
            💬 Supplier flagged{noteList.length ? ` (${noteList.length})` : ""}
          </option>
          <option value={RESHIP_REQUESTED}>
            📮 Reship requested{reshipReqList.length ? ` (${reshipReqList.length})` : ""}
          </option>
          <option value={RESHIP}>
            🔁 Reshipped{reshipList.length ? ` (${reshipList.length})` : ""}
          </option>
          {statuses.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={service}
          onChange={(e) => setService(e.target.value)}
        >
          <option value="all">All services</option>
          {services.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        {encoders.length > 0 && (
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={byFilter}
            onChange={(e) => setByFilter(e.target.value)}
            aria-label="Filter by who encoded the order"
          >
            <option value="all">Anyone</option>
            {encoders.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
            <option value="public">Online form</option>
          </select>
        )}
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          aria-label="Filter by batch tag"
        >
          <option value="all">All batches</option>
          <option value="untagged">Untagged</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.customer_count})
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 text-sm">
          <Input
            type="date"
            className="w-[150px]"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            className="w-[150px]"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
          />
        </div>
      </div>

      {picked.size > 0 && (
        <div className="space-y-2 rounded-lg border border-[#eda100]/40 bg-[#eda100]/10 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Printer className="h-4 w-4 shrink-0 text-[#8a6100]" />
            <span className="flex-1 text-sm text-[#5c4300]">
              <strong>
                {picked.size} order{picked.size === 1 ? "" : "s"} selected
              </strong>{" "}
              — print their PSA forms, or move them all to the next stage.
            </span>
            <button
              type="button"
              onClick={() => {
                setPicked(new Set());
                setConfirmMove(false);
                setMoveError(null);
                setConfirmCombine(false);
                setCombineError(null);
                setCombineTotal("");
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#5c4300] hover:bg-[#eda100]/20"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
            {bulk && !("blocked" in bulk) && !confirmMove && (
              <button
                type="button"
                onClick={() => {
                  setMoveError(null);
                  setConfirmMove(true);
                }}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[#1e3a5f] px-3 text-sm font-semibold text-white shadow-sm hover:bg-[#16304f]"
              >
                <ArrowRight className="h-4 w-4" /> Move to {bulk.targetLabel}
              </button>
            )}
            {combinable && !("blocked" in combinable) && !confirmCombine && (
              <button
                type="button"
                onClick={() => {
                  setCombineError(null);
                  setCombineTotal(String(combinable.suggested));
                  setConfirmCombine(true);
                }}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[#1e3a5f]/30 bg-white px-3 text-sm font-semibold text-[#1e3a5f] shadow-sm hover:bg-[#1e3a5f]/5"
              >
                <Combine className="h-4 w-4" /> Combine into one
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                router.push(`/orders/print?ids=${Array.from(picked).join(",")}`)
              }
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#eda100] px-3 text-sm font-semibold text-[#3d2f00] shadow-sm hover:bg-[#d99400]"
            >
              <Printer className="h-4 w-4" /> Print forms
            </button>
          </div>

          {/* Tag the customers behind these orders. A batch is assembled from
              orders, but named on the customer, so it survives their next one. */}
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-white/70 px-3 py-2">
            <Tags className="h-4 w-4 shrink-0 text-[#8a6100]" />
            <span className="text-sm text-[#5c4300]">Batch tag:</span>
            <TagPicker
              tags={tags}
              selected={applying}
              onChange={setApplying}
              onCreated={(t) =>
                setTags((prev) =>
                  [...prev, t].sort((a, b) => a.name.localeCompare(b.name))
                )
              }
              single
              placeholder="Search or type a batch name…"
            />
            <span className="flex-1" />
            <button
              type="button"
              disabled={applying.length === 0 || tagging}
              onClick={() => applyTag("remove")}
              className="inline-flex h-8 items-center rounded-md border border-[#8a6100]/30 bg-white px-3 text-xs font-medium text-[#5c4300] hover:bg-[#eda100]/20 disabled:opacity-50"
            >
              Remove
            </button>
            <button
              type="button"
              disabled={applying.length === 0 || tagging}
              onClick={() => applyTag("add")}
              className="inline-flex h-8 items-center rounded-md bg-[#8a6100] px-3 text-xs font-semibold text-white hover:bg-[#6f4e00] disabled:opacity-60"
            >
              {tagging ? "Tagging…" : "Tag customers"}
            </button>
          </div>

          {tagNote && <p className="text-xs text-emerald-800">{tagNote}</p>}
          {tagError && (
            <p className="flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {tagError}
            </p>
          )}

          {/* Why the move isn't on offer — staff shouldn't have to guess which
              of the ticked rows is the odd one out. */}
          {bulk && "blocked" in bulk && (
            <p className="flex items-start gap-2 text-xs text-[#5c4300]">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {bulk.blocked}
            </p>
          )}

          {/* Why combining isn't on offer, when two or more are ticked. */}
          {combinable && "blocked" in combinable && (
            <p className="flex items-start gap-2 text-xs text-[#5c4300]">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {combinable.blocked}
            </p>
          )}

          {combinable && !("blocked" in combinable) && confirmCombine && (
            <div className="space-y-2 rounded-md bg-white/70 px-3 py-2.5">
              <p className="text-sm text-[#5c4300]">
                Move all {combinable.rows.length} orders&apos; documents onto{" "}
                <strong>{combinable.keeper.tracking_code}</strong> — one parcel,
                one tracking link for{" "}
                <strong>{combinable.keeper.customer_name}</strong>.
              </p>
              {combinable.oneParcel > 0 && (
                <p className="text-xs text-[#5c4300]/85">
                  {combinable.docs} documents, one delivery — the price already
                  includes {peso(shippingFee)} shipping each, so{" "}
                  {peso(combinable.oneParcel)} of it is no longer owed. Change
                  the figure if you want to charge something else.
                </p>
              )}
              <p className="text-xs text-[#5c4300]/85">
                The other link
                {combinable.rows.length > 2 ? "s" : ""} keep
                {combinable.rows.length > 2 ? "" : "s"} working and now show
                {combinable.rows.length > 2 ? "" : "s"} this order, so whichever
                one the customer saved is the right one.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="combine-total"
                  className="text-sm font-medium text-[#5c4300]"
                >
                  Charge for the combined order
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[#5c4300]/70">
                    ₱
                  </span>
                  <input
                    id="combine-total"
                    inputMode="decimal"
                    value={combineTotal}
                    onChange={(e) =>
                      setCombineTotal(e.target.value.replace(/[^\d.]/g, ""))
                    }
                    className="h-9 w-32 rounded-md border border-[#8a6100]/30 bg-white pl-6 pr-2 text-sm"
                  />
                </div>
                <span className="text-xs text-[#5c4300]/85">
                  {Number(combineTotal) > combinable.subtotal
                    ? `More than the documents come to (${peso(
                        combinable.subtotal
                      )}) — a combined order can be discounted, not marked up.`
                    : `${peso(combinable.subtotal)} of documents, less ${peso(
                        combinable.subtotal - Number(combineTotal)
                      )}`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => setConfirmCombine(false)}
                  disabled={combining}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#5c4300] hover:bg-[#eda100]/20 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={runCombine}
                  disabled={
                    combining || Number(combineTotal) > combinable.subtotal
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-[#1e3a5f] px-3 text-sm font-semibold text-white shadow-sm hover:bg-[#16304f] disabled:opacity-60"
                >
                  <Combine className="h-4 w-4" />
                  {combining
                    ? "Combining…"
                    : `Yes, combine into ${combinable.keeper.tracking_code}`}
                </button>
              </div>
            </div>
          )}

          {combineError && (
            <p className="flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {combineError}
            </p>
          )}

          {bulk && !("blocked" in bulk) && confirmMove && (
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-white/70 px-3 py-2">
              <span className="flex-1 text-sm text-[#5c4300]">
                Move {picked.size} order{picked.size === 1 ? "" : "s"} from{" "}
                <strong>{bulk.from}</strong> to{" "}
                <strong>{bulk.targetLabel}</strong>?
                {bulk.target === "details_received" &&
                  " Each customer gets the details-received SMS."}
              </span>
              <button
                type="button"
                onClick={() => setConfirmMove(false)}
                disabled={moving}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#5c4300] hover:bg-[#eda100]/20 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runBulkMove}
                disabled={moving}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[#1e3a5f] px-3 text-sm font-semibold text-white shadow-sm hover:bg-[#16304f] disabled:opacity-60"
              >
                <ArrowRight className="h-4 w-4" />
                {moving ? "Moving…" : `Yes, move to ${bulk.targetLabel}`}
              </button>
            </div>
          )}

          {moveError && (
            <p className="flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {moveError}
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {onCallList
          ? `${filtered.length} order${filtered.length === 1 ? "" : "s"} to call, most urgent first`
          : `${filtered.length} of ${orders.length} orders`}
      </p>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer align-middle"
                  aria-label="Select all shown"
                  title="Select every order in this filter"
                  checked={allShownPicked}
                  onChange={toggleAllShown}
                />
              </th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">
                {onCallList ? "Why it failed" : "Services"}
              </th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">
                {onCallList ? "Last attempt" : "Created"}
              </th>
              <th className="px-4 py-3 font-medium">Code</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const age = aging(o.status, o.status_since);
              // On the call list, attempts left decide the tint — a 2/3 is
              // urgent even if it only shipped yesterday.
              const tone = onCallList
                ? o.delivery_attempts >= 2
                  ? "bg-red-50"
                  : "bg-amber-50"
                : agingClasses[age];
              return (
                <tr
                  key={o.id}
                  className={cn("border-b last:border-0 hover:bg-accent/40", tone)}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer align-middle"
                      aria-label={`Select ${o.customer_name}`}
                      checked={picked.has(o.id)}
                      onChange={() => toggle(o.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                      {o.customer_name}
                    </Link>
                    {/* A document for someone other than the customer it was
                        booked under — named here so it isn't hidden behind the
                        booker's name. */}
                    {o.document_owners.length > 0 && (
                      <div className="text-xs text-[#2a78d6]">
                        for {o.document_owners.join(", ")}
                      </div>
                    )}
                    {o.customer_phone ? (
                      // tel: so a tap dials straight from the phone the staff
                      // are most likely holding while working the call list.
                      <a
                        href={`tel:${o.customer_phone.replace(/[^\d+]/g, "")}`}
                        className="block text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {o.customer_phone}
                      </a>
                    ) : (
                      <div className="text-xs text-red-600">no phone on file</div>
                    )}
                    {o.tag_ids.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {o.tag_ids.map((id) => {
                          const t = tagById.get(id);
                          return t ? (
                            <TagChip key={id} name={t.name} color={t.color} />
                          ) : null;
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {onCallList
                      ? o.last_attempt_note || "no reason logged"
                      : o.service_names.join(", ")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge code={o.status} label={o.status_label} />
                      {o.source === "public" && (
                        <Badge
                          className="bg-violet-100 text-violet-700"
                          title="Submitted by the customer through your order link"
                        >
                          Online
                        </Badge>
                      )}
                      {o.delivery_attempts > 0 && o.status === "shipped" && (
                        <Badge className={attemptBadgeClasses(o.delivery_attempts)}>
                          Attempt {o.delivery_attempts}/3
                        </Badge>
                      )}
                      {/* The supplier's own word that something is wrong beats
                          the clock: an order a week old with a reason on it is
                          being handled, one without is not. */}
                      {o.delayed_at && (
                        <Badge
                          className="bg-red-100 text-red-700"
                          title={o.delay_reason ?? "Delayed"}
                        >
                          Delayed
                        </Badge>
                      )}
                      {age === "alert" && !o.delayed_at && (
                        <Badge className="bg-red-100 text-red-700">Aging</Badge>
                      )}
                      {o.name_issues.length > 0 && (
                        <Badge
                          className="bg-amber-100 text-amber-800"
                          title={o.name_issues.join("\n")}
                        >
                          Name check
                        </Badge>
                      )}
                      {o.open_supplier_notes > 0 && (
                        <Badge
                          className="bg-[#2a78d6]/15 text-[#1e3a5f]"
                          title="The supplier flagged a missing detail"
                        >
                          Supplier note
                        </Badge>
                      )}
                      {o.id_posted && (
                        <Badge
                          className="bg-violet-100 text-violet-800"
                          title="The supplier posted the finished ID — release it once it arrives"
                        >
                          ID posted
                        </Badge>
                      )}
                      {o.reship_requested && (
                        <Badge
                          className="bg-emerald-100 text-emerald-800"
                          title="Customer asked for a reship — send it out when the parcel is back"
                        >
                          Reship requested
                        </Badge>
                      )}
                      {o.reship_count > 0 && (
                        <Badge
                          className="bg-teal-100 text-teal-800"
                          title="Sent back out after a return"
                        >
                          Reship{o.reship_count > 1 ? ` ×${o.reship_count}` : ""}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {peso(o.total_amount)}
                    {o.discount_amount > 0 && (
                      <span className="block text-[11px] text-emerald-700">
                        less {peso(o.discount_amount)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {onCallList
                      ? fmtDateTime(o.last_attempt_at ?? o.status_since)
                      : fmtDate(o.created_at)}
                    {/* Who took it — the first thing asked when a customer
                        follows up or an order looks wrong. */}
                    {!onCallList && (
                      <div className="text-xs text-muted-foreground/80">
                        {o.created_by_name
                          ? `by ${o.created_by_name}`
                          : o.source === "public"
                            ? "online form"
                            : "—"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{o.tracking_code}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  {onCallList
                  ? "No failed deliveries right now — nothing to chase."
                  : "No orders match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
