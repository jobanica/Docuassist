"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { tagTone } from "./TagChip";
import { createTag, renameTag, deleteTag } from "@/lib/actions/tags";
import { TAG_COLORS, type Tag, type TagColor } from "@/lib/tags";

/**
 * Manage the batch tags. Tags are normally created on the fly while tagging,
 * so this screen is for the tidying afterwards: fixing a typo in a batch name,
 * recolouring, and deleting a batch that is finished with.
 */
export function TagsSettings({ tags: initial }: { tags: Tag[] }) {
  const [tags, setTags] = useState(initial);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  function add() {
    if (!name.trim()) return;
    setError(null);
    start(async () => {
      const res = await createTag(
        name,
        TAG_COLORS[tags.length % TAG_COLORS.length]
      );
      if (!res.ok) return setError(res.error);
      setName("");
      router.refresh();
    });
  }

  function save(t: Tag, patch: Partial<Pick<Tag, "name" | "color">>) {
    const next = { ...t, ...patch };
    setTags((prev) => prev.map((x) => (x.id === t.id ? next : x)));
    setError(null);
    start(async () => {
      const res = await renameTag(t.id, next.name, next.color);
      if (!res.ok) {
        // Put the old value back rather than leaving a name the database refused.
        setTags((prev) => prev.map((x) => (x.id === t.id ? t : x)));
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function remove(t: Tag) {
    setError(null);
    start(async () => {
      const res = await deleteTag(t.id);
      if (!res.ok) return setError(res.error);
      setTags((prev) => prev.filter((x) => x.id !== t.id));
      setConfirming(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
      <div>
        <h2 className="font-semibold text-slate-900">Batch tags</h2>
        <p className="text-sm text-slate-500">
          Tags group customers into the batches you file at the PSA counter.
          You can make one while tagging — this is for renaming, recolouring
          and clearing out batches you are done with.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="New batch name, e.g. Batch 30 Aug"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" onClick={add} disabled={busy || !name.trim()}>
          <Plus className="h-4 w-4" /> Add tag
        </Button>
      </div>

      {error && (
        <p className="flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <ul className="divide-y">
        {tags.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
            <Input
              className="max-w-xs"
              defaultValue={t.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== t.name) save(t, { name: v });
              }}
            />
            <div className="flex gap-1">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${t.name} ${c}`}
                  onClick={() => save(t, { color: c as TagColor })}
                  className={`h-6 w-6 rounded-full border ${tagTone(c)} ${
                    t.color === c ? "ring-2 ring-slate-400 ring-offset-1" : ""
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-slate-500">
              {t.customer_count} customer{t.customer_count === 1 ? "" : "s"}
            </span>
            <span className="flex-1" />
            {confirming === t.id ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-red-700">
                  Remove from {t.customer_count} customer
                  {t.customer_count === 1 ? "" : "s"}?
                </span>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => remove(t)}
                  disabled={busy}
                  className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  Delete tag
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(t.id)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </li>
        ))}
        {tags.length === 0 && (
          <li className="py-6 text-center text-sm text-slate-500">
            No tags yet. Add one here, or type a batch name while tagging
            customers.
          </li>
        )}
      </ul>
    </div>
  );
}
