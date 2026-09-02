"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, ShieldAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toMessage, unwrap } from "@/lib/action-result";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateBusinessInfo,
  uploadBusinessLogo,
} from "@/lib/actions/settings";

export function BusinessSettings({
  initial,
  canEdit,
}: {
  initial: { business_name: string; logo_url: string };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  /**
   * Send the chosen file straight up and point the settings at it.
   *
   * Saved on upload rather than waiting for "Save changes": the URL comes back
   * from the server, so there is nothing for the user to confirm, and leaving
   * it unsaved would mean a logo sitting in the bucket that nothing points at.
   */
  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      let binary = "";
      const chunk = 0x8000;
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const res = unwrap(
        await uploadBusinessLogo(file.name, file.type, btoa(binary))
      );
      setV((prev) => ({ ...prev, logo_url: res.url }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await updateBusinessInfo(v));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
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

        <div className="space-y-2">
          <Label className="text-xs text-slate-600">Logo</Label>

          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-slate-50">
              {v.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.logo_url}
                  alt="Logo preview"
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <span className="text-[10px] text-slate-400">No logo</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {canEdit && (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-accent/40">
                  <Upload className="h-4 w-4" />
                  {uploading ? "Uploading…" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) upload(f);
                    }}
                  />
                </label>
              )}
              <p className="mt-1.5 text-xs text-slate-400">
                PNG with a transparent background works best. Max 2MB. We host
                it ourselves, so it never expires.
              </p>
            </div>
          </div>

          {/* Kept for an already-hosted logo, but uploading is the safe path:
              a pasted Facebook or Drive link expires and leaves the customer's
              tracking page showing a broken image. */}
          <details className="pt-1">
            <summary className="cursor-pointer text-xs text-slate-500">
              Or paste a URL
            </summary>
            <Input
              className="mt-2"
              disabled={!canEdit}
              value={v.logo_url}
              onChange={(e) => setV({ ...v, logo_url: e.target.value })}
              placeholder="https://…/logo.png"
            />
            <p className="mt-1 text-xs text-amber-700">
              Avoid Facebook or Google Drive links — they expire and the logo
              disappears from your tracking pages.
            </p>
          </details>
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
