"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Copy, Check, ExternalLink, ShieldAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toMessage, unwrap } from "@/lib/action-result";
import { updatePublicOrderSettings } from "@/lib/actions/settings";

export function PublicFormSettings({
  initial,
  canEdit,
  orderUrl,
  smsConfigured,
}: {
  initial: { public_orders_enabled: boolean; otp_required: boolean };
  canEdit: boolean;
  orderUrl: string;
  smsConfigured: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await updatePublicOrderSettings(v));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(orderUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Only admins can change these. You can view them here.
        </p>
      )}

      {/* The link to give customers */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        <p className="font-medium text-slate-900">Your order link</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Send this to customers, pin it on your page, or put it in your bio.
          They pick their documents, fill in their own details and address, and
          the order lands in your Orders board.
        </p>
        <p className="mt-3 break-all rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">
          {orderUrl}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={copyLink}>
            {copied ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy link</>}
          </Button>
          <a href={orderUrl} target="_blank" rel="noopener noreferrer"
             className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent">
            <ExternalLink className="h-4 w-4" /> Open
          </a>
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-4 rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block font-medium text-slate-900">
              Accept online orders
            </span>
            <span className="block text-xs text-slate-500">
              Turn off to close the form — customers see a &ldquo;message our
              page&rdquo; note instead. Existing orders are unaffected.
            </span>
          </span>
          <input
            type="checkbox" className="mt-1 h-5 w-5 shrink-0"
            disabled={!canEdit}
            checked={v.public_orders_enabled}
            onChange={(e) => setV({ ...v, public_orders_enabled: e.target.checked })}
          />
        </label>

        <label className="flex items-start justify-between gap-4 border-t pt-4">
          <span>
            <span className="block font-medium text-slate-900">
              Require phone confirmation (OTP)
            </span>
            <span className="block text-xs text-slate-500">
              Customers must enter a 6-digit code texted to their mobile before
              the order is created. Stops fake numbers and wrong digits — the
              main cause of failed deliveries.
            </span>
          </span>
          <input
            type="checkbox" className="mt-1 h-5 w-5 shrink-0"
            disabled={!canEdit}
            checked={v.otp_required}
            onChange={(e) => setV({ ...v, otp_required: e.target.checked })}
          />
        </label>

        {v.otp_required && !smsConfigured && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>No SMS key configured.</strong> With OTP required and
              SEMAPHORE_API_KEY unset, codes are logged instead of texted, so
              customers can&apos;t complete an order. Add the key, or turn OTP
              off until you do.
            </span>
          </p>
        )}
        {v.otp_required && smsConfigured && (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            Each confirmation costs one SMS (~₱0.50). Sends are capped at 3 per
            number and 6 per device per hour, with a 60-second wait between
            codes, so this can&apos;t be run up on you.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {canEdit && (
          <Button onClick={save} disabled={!dirty || pending}>
            <Save className="h-4 w-4" />
            {saved ? "Saved!" : pending ? "Saving…" : "Save changes"}
          </Button>
        )}
      </div>
    </div>
  );
}
