"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, ShieldAlert, Upload, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toMessage, unwrap } from "@/lib/action-result";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadPaymentQr, updatePaymentInfo } from "@/lib/actions/settings";

/**
 * The QR a customer scans at checkout, and the words printed beside it.
 *
 * Uploaded rather than pasted for the same reason the logo is: the payment
 * step is opened by someone who is not logged in, so anything behind a signed
 * or expiring URL simply fails to load at the moment they are trying to pay.
 */
export function PaymentSettings({
  initial,
  canEdit,
}: {
  initial: { payment_qr_url: string; payment_note: string };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        binary += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      const res = unwrap(
        await uploadPaymentQr(file.name, file.type, btoa(binary))
      );
      setV((prev) => ({ ...prev, payment_qr_url: res.url }));
      flash();
      router.refresh();
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await updatePaymentInfo(v));
        flash();
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <QrCode className="h-4 w-4" /> Payment QR
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Shown to customers on the payment step of the online order form, after
          they confirm their details.
        </p>
      </div>

      {!canEdit && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Only admins can change these.
        </p>
      )}

      <div className="flex items-start gap-4">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-slate-50">
          {v.payment_qr_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={v.payment_qr_url}
              alt="Payment QR preview"
              className="h-full w-full object-contain p-1.5"
            />
          ) : (
            <span className="px-2 text-center text-[11px] text-slate-400">
              No QR uploaded
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {canEdit && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-accent/40">
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload QR image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
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
            A screenshot of your GCash or bank QR. PNG or JPG, max 2MB. Saved
            the moment it uploads.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-slate-600">
          Payment instructions (shown beside the QR)
        </Label>
        <Input
          disabled={!canEdit}
          value={v.payment_note}
          onChange={(e) => setV({ ...v, payment_note: e.target.value })}
          placeholder="e.g. GCash — Juana D. · 0917 123 4567"
        />
        <p className="text-xs text-slate-400">
          Put the account name and number here so a customer who can&apos;t scan
          can still send payment manually.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {canEdit && (
        <Button onClick={save} disabled={!dirty || pending}>
          <Save className="h-4 w-4" />
          {saved ? "Saved!" : pending ? "Saving…" : "Save changes"}
        </Button>
      )}
    </div>
  );
}
