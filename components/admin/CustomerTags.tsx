"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { TagPicker } from "./TagPicker";
import { setCustomerTags } from "@/lib/actions/tags";
import type { Tag } from "@/lib/tags";

/** The tags on one customer, editable in place. */
export function CustomerTags({
  customerId,
  tags: initialTags,
  selected: initialSelected,
}: {
  customerId: string;
  tags: Tag[];
  selected: string[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [selected, setSelected] = useState(initialSelected);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const router = useRouter();

  function change(ids: string[]) {
    const before = selected;
    setSelected(ids);
    setError(null);
    startSave(async () => {
      const res = await setCustomerTags(customerId, ids);
      if (!res.ok) {
        // Put the chips back rather than showing a state the database rejected.
        setSelected(before);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <TagPicker
        tags={tags}
        selected={selected}
        onChange={change}
        onCreated={(t) =>
          setTags((prev) => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)))
        }
      />
      {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
      {error && (
        <p className="flex items-start gap-1 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
