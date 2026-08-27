"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, ExternalLink, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBusinessInfo } from "@/lib/actions/settings";

export function BusinessSettings({
  initial,
  canEdit,
}: {
  initial: { business_name: string; messenger_url: string; logo_url: string };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await updateBusinessInfo(v);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
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

      <div className="space-y-4 rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">Business name</Label>
          <Input
            disabled={!canEdit}
            value={v.business_name}
            onChange={(e) => setV({ ...v, business_name: e.target.value })}
          />
          <p className="text-xs text-slate-400">
            Shown in the header of every customer tracking page.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">
            Facebook / Messenger link
          </Label>
          <Input
            disabled={!canEdit}
            value={v.messenger_url}
            onChange={(e) => setV({ ...v, messenger_url: e.target.value })}
            placeholder="https://www.facebook.com/yourpage"
          />
          <p className="text-xs text-slate-400">
            Where the &ldquo;Message us on Facebook&rdquo; button sends
            customers. Use your page URL, or{" "}
            <span className="font-mono">https://m.me/yourpage</span> to open a
            Messenger chat directly.
          </p>
          {v.messenger_url && (
            <a
              href={v.messenger_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#2a78d6] hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Test this link
            </a>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">Logo URL (optional)</Label>
          <Input
            disabled={!canEdit}
            value={v.logo_url}
            onChange={(e) => setV({ ...v, logo_url: e.target.value })}
            placeholder="https://…/logo.png"
          />
          <p className="text-xs text-slate-400">
            Leave blank to use the default badge.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {canEdit && (
          <Button onClick={submit} disabled={!dirty || pending}>
            <Save className="h-4 w-4" />
            {saved ? "Saved!" : pending ? "Saving…" : "Save changes"}
          </Button>
        )}
      </div>
    </div>
  );
}
