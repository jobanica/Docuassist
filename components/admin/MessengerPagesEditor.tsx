"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Save,
  Star,
  ExternalLink,
  ShieldAlert,
  X,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toMessage, type ActionResult, unwrap } from "@/lib/action-result";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createMessengerPage,
  setDefaultMessengerPage,
  setMessengerPageActive,
  updateMessengerPage,
} from "@/lib/actions/messenger-pages";
import type { MessengerPage } from "@/lib/types";

/**
 * The Facebook pages a tracking link can point at.
 *
 * More than one exists because different lines of work are answered by
 * different pages — whoever encodes an order picks the right one, and the
 * customer's "Message us" button opens that inbox.
 */
export function MessengerPagesEditor({
  pages,
  canEdit,
}: {
  pages: MessengerPage[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", url: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", url: "" });

  function run(fn: () => Promise<ActionResult<unknown>>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await fn());
        after?.();
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  return (
    <div className="space-y-3 rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
      <div>
        <p className="font-medium text-slate-900">Facebook pages</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Each order&apos;s tracking link has a &ldquo;Message us&rdquo; button.
          Add a page for every inbox you actually answer — staff pick which one
          an order uses, so customers reach the person handling their document.
        </p>
      </div>

      {!canEdit && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Only admins can change these. You can view them here.
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <ul className="divide-y rounded-lg border">
        {pages.map((p) => (
          <li key={p.id} className="p-3">
            {editing === p.id ? (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                    placeholder="Page name"
                  />
                  <Input
                    value={edit.url}
                    onChange={(e) => setEdit({ ...edit, url: e.target.value })}
                    placeholder="https://www.facebook.com/yourpage"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() => updateMessengerPage(p.id, edit), () =>
                        setEditing(null)
                      )
                    }
                  >
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(null)}
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-slate-900">
                    {p.name}
                    {p.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#eda100]/15 px-2 py-0.5 text-[11px] font-medium text-[#8a6100]">
                        <Star className="h-3 w-3" /> Default
                      </span>
                    )}
                    {!p.active && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                        Hidden
                      </span>
                    )}
                  </p>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 truncate text-xs text-[#2a78d6] hover:underline"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" /> {p.url}
                  </a>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        setEditing(p.id);
                        setEdit({ name: p.name, url: p.url });
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    {!p.is_default && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => setDefaultMessengerPage(p.id))}
                      >
                        <Star className="h-3.5 w-3.5" /> Make default
                      </Button>
                    )}
                    {!p.is_default && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() => setMessengerPageActive(p.id, !p.active))
                        }
                      >
                        {p.active ? "Hide" : "Unhide"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
        {pages.length === 0 && (
          <li className="p-4 text-center text-sm text-slate-500">
            No pages yet — add the one you answer on.
          </li>
        )}
      </ul>

      {canEdit &&
        (adding ? (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Page name</Label>
                <Input
                  autoFocus
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="DocuAssist IDs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Page link</Label>
                <Input
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://www.facebook.com/yourpage"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Use the page URL, or{" "}
              <span className="font-mono">https://m.me/yourpage</span> to open a
              Messenger chat directly.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() => createMessengerPage(draft), () => {
                    setDraft({ name: "", url: "" });
                    setAdding(false);
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add page
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add a page
          </Button>
        ))}
    </div>
  );
}
