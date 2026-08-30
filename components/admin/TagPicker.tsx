"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Check, AlertCircle } from "lucide-react";
import { TagChip, tagTone } from "./TagChip";
import { createTag } from "@/lib/actions/tags";
import { TAG_COLORS, type Tag } from "@/lib/tags";

/**
 * Pick a batch tag, or type a new one.
 *
 * Staff name a batch the moment they need it ("Batch 30 Aug"), so creating is
 * part of picking rather than a trip to a settings screen first. A name that
 * already exists resolves to that tag instead of failing — typing the batch
 * you are working on should always find it.
 */
export function TagPicker({
  tags,
  selected,
  onChange,
  onCreated,
  placeholder = "Search or type a new tag…",
  single = false,
}: {
  tags: Tag[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Lets the parent add the new tag to its own list without a refetch. */
  onCreated?: (tag: Tag) => void;
  placeholder?: string;
  /** Bulk tagging applies one tag at a time; a customer can hold many. */
  single?: boolean;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function away(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const needle = q.trim().toLowerCase();
  const matches = tags.filter((t) => t.name.toLowerCase().includes(needle));
  const exact = tags.find((t) => t.name.toLowerCase() === needle);

  function toggle(id: string) {
    if (single) {
      onChange(selected[0] === id ? [] : [id]);
      setOpen(false);
      return;
    }
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    );
  }

  async function create() {
    const name = q.trim();
    if (!name || busy) return;
    setError(null);
    setBusy(true);
    // Cycle the palette so consecutive batches don't all come out grey.
    const color = TAG_COLORS[tags.length % TAG_COLORS.length];
    const res = await createTag(name, color);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCreated?.(res.value);
    setQ("");
    onChange(single ? [res.value.id] : [...selected, res.value.id]);
    if (single) setOpen(false);
  }

  return (
    <div className="relative" ref={box}>
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((id) => {
          const t = tags.find((x) => x.id === id);
          if (!t) return null;
          return (
            <TagChip
              key={id}
              name={t.name}
              color={t.color}
              onRemove={() => toggle(id)}
            />
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700"
        >
          <Plus className="h-3 w-3" /> Tag
        </button>
      </div>

      {open && (
        <div className="absolute z-20 mt-2 w-64 rounded-lg border bg-white p-2 shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (exact) toggle(exact.id);
                else void create();
              }
            }}
            placeholder={placeholder}
            className="w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-slate-400"
          />
          <ul className="mt-2 max-h-52 space-y-0.5 overflow-y-auto">
            {matches.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-slate-50"
                >
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full border ${tagTone(t.color)}`}
                  />
                  <span className="flex-1 truncate">{t.name}</span>
                  <span className="text-xs text-slate-400">
                    {t.customer_count}
                  </span>
                  {selected.includes(t.id) && (
                    <Check className="h-3.5 w-3.5 text-slate-600" />
                  )}
                </button>
              </li>
            ))}
            {matches.length === 0 && !needle && (
              <li className="px-2 py-1 text-xs text-slate-400">
                No tags yet — type a batch name to make one.
              </li>
            )}
          </ul>
          {needle && !exact && (
            <button
              type="button"
              onClick={create}
              disabled={busy}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" />
              {busy ? "Creating…" : `Create “${q.trim()}”`}
            </button>
          )}
          {error && (
            <p className="mt-1 flex items-start gap-1 px-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
