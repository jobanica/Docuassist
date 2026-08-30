"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Tags, X, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/dates";
import { TagChip } from "./TagChip";
import { TagPicker } from "./TagPicker";
import { tagCustomers } from "@/lib/actions/tags";
import type { Tag } from "@/lib/tags";

export interface CustomerRow {
  id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  province: string | null;
  order_count: number;
  created_at: string;
  tag_ids: string[];
}

export function CustomersList({
  customers,
  tags: initialTags,
}: {
  customers: CustomerRow[];
  tags: Tag[];
}) {
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const router = useRouter();

  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return customers.filter((c) => {
      if (tagFilter === "untagged" && c.tag_ids.length > 0) return false;
      if (tagFilter !== "all" && tagFilter !== "untagged" &&
          !c.tag_ids.includes(tagFilter)) return false;
      if (!n) return true;
      return `${c.full_name} ${c.phone ?? ""}`.toLowerCase().includes(n);
    });
  }, [customers, q, tagFilter]);

  const shown = filtered.map((c) => c.id);
  const allShownPicked = shown.length > 0 && shown.every((id) => picked.has(id));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function apply(mode: "add" | "remove") {
    const tagId = applying[0];
    if (!tagId) return;
    setError(null);
    setNote(null);
    startBusy(async () => {
      const res = await tagCustomers(Array.from(picked), tagId, mode);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const name = byId.get(tagId)?.name ?? "tag";
      setNote(
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or phone"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="h-10 rounded-md border bg-white px-3 text-sm"
          aria-label="Filter by tag"
        >
          <option value="all">All tags</option>
          <option value="untagged">Untagged</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.customer_count})
            </option>
          ))}
        </select>
      </div>

      {picked.size > 0 && (
        <div className="space-y-2 rounded-lg border border-[#eda100]/40 bg-[#eda100]/10 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Tags className="h-4 w-4 shrink-0 text-[#8a6100]" />
            <span className="text-sm text-[#5c4300]">
              <strong>
                {picked.size} customer{picked.size === 1 ? "" : "s"} selected
              </strong>{" "}
              — pick a batch tag:
            </span>
            <TagPicker
              tags={tags}
              selected={applying}
              onChange={setApplying}
              onCreated={(t) => setTags((prev) => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)))}
              single
              placeholder="Search or type a batch name…"
            />
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => {
                setPicked(new Set());
                setError(null);
                setNote(null);
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#5c4300] hover:bg-[#eda100]/20"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
            <button
              type="button"
              disabled={applying.length === 0 || busy}
              onClick={() => apply("remove")}
              className="inline-flex h-9 items-center rounded-md border border-[#8a6100]/30 bg-white px-3 text-sm font-medium text-[#5c4300] hover:bg-[#eda100]/20 disabled:opacity-50"
            >
              Remove tag
            </button>
            <button
              type="button"
              disabled={applying.length === 0 || busy}
              onClick={() => apply("add")}
              className="inline-flex h-9 items-center rounded-md bg-[#eda100] px-3 text-sm font-semibold text-[#3d2f00] shadow-sm hover:bg-[#d99400] disabled:opacity-60"
            >
              {busy ? "Applying…" : "Apply tag"}
            </button>
          </div>
          {error && (
            <p className="flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
      )}

      {note && <p className="text-xs text-emerald-700">{note}</p>}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select every customer shown"
                  className="h-4 w-4"
                  checked={allShownPicked}
                  onChange={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (allShownPicked) shown.forEach((id) => next.delete(id));
                      else shown.forEach((id) => next.add(id));
                      return next;
                    })
                  }
                />
              </th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Tags</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Orders</th>
              <th className="px-4 py-3 font-medium">Since</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.full_name}`}
                    className="h-4 w-4"
                    checked={picked.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                    {c.full_name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap gap-1">
                    {c.tag_ids.map((id) => {
                      const t = byId.get(id);
                      return t ? (
                        <TagChip key={id} name={t.name} color={t.color} />
                      ) : null;
                    })}
                    {c.tag_ids.length === 0 && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {[c.city, c.province].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">{c.order_count}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {fmtDate(c.created_at)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
