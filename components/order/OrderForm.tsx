"use client";

import { useEffect, useState } from "react";
import {
  Check, ChevronRight, ChevronLeft, Loader2, MessageCircle,
  ShieldCheck, AlertCircle, Phone,
} from "lucide-react";
import { peso } from "@/lib/money";
import type { FormFieldDef } from "@/lib/types";

interface Service {
  id: string; code: string; name: string; price: number;
  form_fields: FormFieldDef[];
  processing_days_max: number; shipping_days_estimate: number;
}
interface Config {
  enabled: boolean; otpRequired: boolean;
  businessName: string; messengerUrl: string | null;
  /** Uploaded in Settings → Business. Empty means no QR is set up yet. */
  paymentQrUrl: string | null;
  paymentNote: string | null;
  services: Service[];
}

type Step =
  | "docs"
  | "details"
  | "delivery"
  /** Read your answers back before any money moves. */
  | "review"
  | "verify"
  /** Scan the QR, then say you have paid. */
  | "pay"
  | "done";

const emptyDelivery = {
  full_name: "", phone: "", messenger_name: "",
  address_line: "", barangay: "", city: "", province: "", zip: "", notes: "",
};

export function OrderForm({ config }: { config: Config }) {
  const [step, setStep] = useState<Step>("docs");
  const [picked, setPicked] = useState<Record<string, { quantity: number; form_details: Record<string, string> }>>({});
  const [delivery, setDelivery] = useState({ ...emptyDelivery });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // OTP
  const [otpSent, setOtpSent] = useState(false);
  const [otpStubbed, setOtpStubbed] = useState(false);
  const [code, setCode] = useState("");
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const [trackingCode, setTrackingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Proof of payment: the customer attaches it here so the office can check the
  // money before anything is filed.
  const [receipts, setReceipts] = useState(0);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const chosen = config.services.filter((s) => picked[s.id]);
  const total = chosen.reduce((sum, s) => sum + Number(s.price) * picked[s.id].quantity, 0);
  const longest = chosen.reduce(
    (m, s) => Math.max(m, s.processing_days_max + s.shipping_days_estimate), 0
  );

  function toggle(s: Service) {
    setError(null);
    setPicked((p) => {
      const n = { ...p };
      if (n[s.id]) delete n[s.id];
      else n[s.id] = { quantity: 1, form_details: {} };
      return n;
    });
  }
  function setField(id: string, key: string, v: string) {
    setPicked((p) => ({ ...p, [id]: { ...p[id], form_details: { ...p[id].form_details, [key]: v } } }));
  }

  /** Required fields the customer hasn't filled yet, for the current step. */
  function missingDetails(): string | null {
    for (const s of chosen) {
      for (const f of s.form_fields ?? []) {
        if (f.required && !picked[s.id].form_details[f.key]?.trim()) {
          return `${s.name}: please fill in ${f.label}.`;
        }
      }
    }
    return null;
  }
  function missingDelivery(): string | null {
    if (delivery.full_name.trim().length < 2) return "Please enter your full name.";
    if (!/^(\+?63|0)?9\d{9}$/.test(delivery.phone.replace(/[^\d+]/g, "")))
      return "Please enter a valid PH mobile number (09XXXXXXXXX).";
    if (delivery.address_line.trim().length < 3) return "Please enter your street address.";
    if (delivery.barangay.trim().length < 2) return "Please enter your barangay.";
    if (delivery.city.trim().length < 2) return "Please enter your city or municipality.";
    if (delivery.province.trim().length < 2) return "Please enter your province.";
    return null;
  }

  async function sendCode() {
    setError(null); setBusy(true);
    try {
      const r = await fetch("/api/order/otp/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: delivery.phone }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Could not send the code."); return; }
      setOtpSent(true);
      setOtpStubbed(Boolean(j.stubbed));
      setCooldown(60);
    } catch { setError("Network problem. Please try again."); }
    finally { setBusy(false); }
  }

  async function checkCode() {
    setError(null); setBusy(true);
    try {
      const r = await fetch("/api/order/otp/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: delivery.phone, code }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Incorrect code."); return; }
      setOtpToken(j.token);
      await submit(j.token);
    } catch { setError("Network problem. Please try again."); }
    finally { setBusy(false); }
  }

  /**
   * Send the receipt straight up, keyed by the tracking code.
   *
   * The code is the customer's own secret — the same one that opens their
   * whole order — so it is what authorises the upload. Nothing here marks the
   * payment good; it only hands the office something to look at.
   */
  async function sendReceipt(file: File) {
    if (!trackingCode) return;
    setError(null);
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        binary += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      const r = await fetch("/api/order/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingCode,
          fileName: file.name,
          mimeType: file.type,
          data: btoa(binary),
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Could not upload that file.");
        return;
      }
      setReceipts(j.count ?? receipts + 1);
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function submit(token?: string | null) {
    setError(null); setBusy(true);
    try {
      const r = await fetch("/api/order/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otpToken: token ?? otpToken,
          order: {
            ...delivery,
            items: chosen.map((s) => ({
              service_id: s.id,
              quantity: picked[s.id].quantity,
              form_details: picked[s.id].form_details,
            })),
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Could not submit your order."); return; }
      setTrackingCode(j.trackingCode);
      // Created, unpaid. Payment comes next; the office sees the order either
      // way, so someone who drops out at the QR can still be followed up.
      setStep("pay");
    } catch { setError("Network problem. Please try again."); }
    finally { setBusy(false); }
  }

  // ---------- done ----------
  // The tracking link is the customer's only way back in — there is no account
  // and no password — so this screen's whole job is to get it saved. Said
  // plainly and twice, with the code shown as text for anyone who screenshots
  // rather than taps.
  if (step === "done" && trackingCode) {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/track/${trackingCode}`
        : `/track/${trackingCode}`;
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-7 w-7 text-emerald-600" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">Salamat po! 🎉</h2>
        <p className="mt-1 text-sm text-slate-600">
          Your order is in. We&apos;ll check your payment and start right
          after — makikita ninyo ang status sa link na ito.
        </p>

        <div className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-left">
          <p className="flex items-start gap-2 text-sm font-bold text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            I-save po ninyo ang link na ito
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-amber-900/90">
            This is how you check your order — walang account, walang app.
            Screenshot it, or send it to yourself on Messenger. If you lose it,
            you can still find your order by your mobile number at{" "}
            <strong>/track</strong>.
          </p>
        </div>

        <a
          href={`/track/${trackingCode}`}
          className="mt-4 block rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"
        >
          Open my tracking page
        </a>

        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(
              () => setCopied(true),
              () => setCopied(false)
            );
            setTimeout(() => setCopied(false), 2000);
          }}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700"
        >
          {copied ? "Copied!" : "Copy my tracking link"}
        </button>

        <p className="mt-3 break-all font-mono text-xs text-slate-500">{url}</p>
        <p className="mt-4 text-xs text-slate-500">
          Total: <strong>{peso(total)}</strong>
        </p>
      </div>
    );
  }

  const steps: Step[] = [
    "docs",
    "details",
    "delivery",
    "review",
    ...(config.otpRequired ? (["verify"] as Step[]) : []),
    "pay",
  ];
  const idx = steps.indexOf(step);

  return (
    <div className="space-y-4">
      {/* progress */}
      <div className="flex items-center gap-1.5">
        {steps.map((s, i) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-blue-600" : "bg-slate-200"}`} />
        ))}
      </div>

      {/* ---------- 1. documents ---------- */}
      {step === "docs" && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">Anong dokumento po ang kailangan ninyo?</h2>
          <p className="mt-0.5 text-sm text-slate-500">Choose one or more documents.</p>
          <div className="mt-4 space-y-2">
            {config.services.map((s) => (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 ${
                  picked[s.id] ? "border-blue-600 bg-blue-50/50" : "border-slate-200"
                }`}
              >
                <input type="checkbox" className="h-5 w-5" checked={!!picked[s.id]} onChange={() => toggle(s)} />
                <span className="flex-1">
                  <span className="block font-medium text-slate-900">{s.name}</span>
                  <span className="block text-xs text-slate-500">
                    approx. {s.processing_days_max + s.shipping_days_estimate} days incl. delivery
                  </span>
                </span>
                <span className="font-semibold text-slate-900">{peso(s.price)}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ---------- 2. per-document details ---------- */}
      {step === "details" && (
        <section className="space-y-4">
          {chosen.map((s) => (
            <div key={s.id} className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-900">{s.name}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Please copy the details exactly as they appear on the record.
              </p>
              <div className="mt-3 space-y-3">
                {(s.form_fields ?? []).map((f) => (
                  <div key={f.key}>
                    <label className="text-xs font-medium text-slate-600">
                      {f.label} {f.required && <span className="text-red-500">*</span>}
                    </label>
                    {f.type === "select" && (f.options ?? []).length > 0 ? (
                      <select
                        value={picked[s.id].form_details[f.key] ?? ""}
                        onChange={(e) => setField(s.id, f.key, e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
                      >
                        <option value="">— pumili po —</option>
                        {(f.options ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                        value={picked[s.id].form_details[f.key] ?? ""}
                        onChange={(e) => setField(s.id, f.key, e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ---------- 3. delivery ---------- */}
      {step === "delivery" && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">Saan po namin ipapadala?</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Cash on delivery — bayad po pagdating ng dokumento.
          </p>
          <div className="mt-4 space-y-3">
            <Field label="Full name *" value={delivery.full_name} onChange={(v) => setDelivery({ ...delivery, full_name: v })} />
            <Field label="Mobile number *" value={delivery.phone} placeholder="09XXXXXXXXX" inputMode="tel"
                   onChange={(v) => setDelivery({ ...delivery, phone: v })} />
            <Field label="Facebook / Messenger name" value={delivery.messenger_name} onChange={(v) => setDelivery({ ...delivery, messenger_name: v })} />
            <Field label="House no. & street *" value={delivery.address_line} onChange={(v) => setDelivery({ ...delivery, address_line: v })} />
            <Field label="Barangay *" value={delivery.barangay} onChange={(v) => setDelivery({ ...delivery, barangay: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="City / Municipality *" value={delivery.city} onChange={(v) => setDelivery({ ...delivery, city: v })} />
              <Field label="Province *" value={delivery.province} onChange={(v) => setDelivery({ ...delivery, province: v })} />
            </div>
            <Field label="ZIP code" value={delivery.zip} inputMode="numeric" onChange={(v) => setDelivery({ ...delivery, zip: v })} />
            <Field label="Notes for us (optional)" value={delivery.notes} onChange={(v) => setDelivery({ ...delivery, notes: v })} />
          </div>
        </section>
      )}

      {/* ---------- 4. review — read it back before any money moves ------- */}
      {step === "review" && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">
            Tama po ba lahat? Pakicheck muna.
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            A PSA request is filed exactly as written here. A wrong letter means
            a wrong certificate, so please read it once before paying.
          </p>

          <div className="mt-4 space-y-3">
            {chosen.map((s2) => (
              <div key={s2.id} className="rounded-xl border border-slate-200 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-slate-900">
                    {s2.name}
                    {picked[s2.id].quantity > 1 && ` × ${picked[s2.id].quantity}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setError(null); setStep("details"); }}
                    className="shrink-0 text-xs font-medium text-blue-600 underline"
                  >
                    Edit
                  </button>
                </div>
                <dl className="mt-2 space-y-1">
                  {s2.form_fields
                    .filter((f) => (picked[s2.id].form_details[f.key] ?? "").trim())
                    .map((f) => (
                      <div key={f.key} className="flex gap-2 text-[13px]">
                        <dt className="w-32 shrink-0 text-slate-500">{f.label}</dt>
                        <dd className="min-w-0 flex-1 break-words font-medium text-slate-900">
                          {picked[s2.id].form_details[f.key]}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}

            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-slate-900">Delivery details</p>
                <button
                  type="button"
                  onClick={() => { setError(null); setStep("delivery"); }}
                  className="shrink-0 text-xs font-medium text-blue-600 underline"
                >
                  Edit
                </button>
              </div>
              <dl className="mt-2 space-y-1">
                {[
                  ["Name", delivery.full_name],
                  ["Mobile", delivery.phone],
                  ["Messenger", delivery.messenger_name],
                  [
                    "Address",
                    [delivery.address_line, delivery.barangay, delivery.city,
                     delivery.province, delivery.zip].filter(Boolean).join(", "),
                  ],
                  ["Notes", delivery.notes],
                ]
                  .filter(([, v]) => String(v ?? "").trim())
                  .map(([k, v]) => (
                    <div key={k as string} className="flex gap-2 text-[13px]">
                      <dt className="w-32 shrink-0 text-slate-500">{k}</dt>
                      <dd className="min-w-0 flex-1 break-words font-medium text-slate-900">
                        {v}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          </div>

          <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Once filed with the PSA, a request can no longer be cancelled or
            changed — kaya pakisiguro po na tama ang spelling ng pangalan at
            petsa.
          </p>
        </section>
      )}

      {/* ---------- 5. payment ---------- */}
      {step === "pay" && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">Bayad po — {peso(total)}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Scan the QR with GCash or your banking app, then tap the button
            below. We start processing the same day we see it.
          </p>

          {config.paymentQrUrl ? (
            <div className="mt-4 flex flex-col items-center">
              <div className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={config.paymentQrUrl}
                  alt="Payment QR code"
                  className="h-56 w-56 object-contain"
                />
              </div>
              <p className="mt-3 text-center text-2xl font-extrabold text-slate-900">
                {peso(total)}
              </p>
              {config.paymentNote && (
                <p className="mt-1 text-center text-sm text-slate-600">
                  {config.paymentNote}
                </p>
              )}
            </div>
          ) : (
            // No QR configured yet — say so instead of showing an empty frame.
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-600">
              Message us for the payment details and we&apos;ll send them right
              away.
              {config.paymentNote && (
                <span className="mt-1 block font-medium text-slate-800">
                  {config.paymentNote}
                </span>
              )}
            </div>
          )}

          {/* The proof, attached here rather than chased on Messenger. The
              office checks it before the document is filed, so asking for it
              at the moment they still have the screenshot open is the only
              time it is easy for them. */}
          <div className="mt-5 rounded-xl border-2 border-dashed border-slate-300 p-4">
            <p className="text-sm font-semibold text-slate-900">
              Upload your receipt
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">
              Screenshot po ng GCash or bank confirmation. We check it before we
              file your document — mas mabilis kaysa habulin pa sa Messenger.
            </p>

            {receipts > 0 && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-800">
                <Check className="h-4 w-4 shrink-0" />
                {receipts} file{receipts === 1 ? "" : "s"} received — salamat po!
              </p>
            )}

            <label className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 active:scale-[0.99]">
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : (
                <>{receipts > 0 ? "Add another file" : "Choose a file or photo"}</>
              )}
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) sendReceipt(f);
                }}
              />
            </label>
          </div>

          <button
            onClick={() => setStep("done")}
            disabled={receipts === 0 || uploading}
            className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white active:scale-[0.99] disabled:opacity-50"
          >
            I&apos;ve paid — show my tracking link
          </button>

          {receipts === 0 && (
            // Never trap someone who genuinely cannot attach it right now: the
            // order already exists, and a lost customer is worse than a
            // receipt that arrives on Messenger ten minutes later.
            <button
              onClick={() => setStep("done")}
              className="mt-2 w-full rounded-xl px-4 py-2 text-center text-xs text-slate-500 underline"
            >
              I&apos;ll send my receipt later
            </button>
          )}

          <p className="mt-2 text-center text-xs text-slate-400">
            Your order is already saved. We begin once we&apos;ve checked your
            payment.
          </p>
        </section>
      )}

      {/* ---------- 4. OTP ---------- */}
      {step === "verify" && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-blue-600" />
            <h2 className="font-bold text-slate-900">Confirm your mobile number</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            We&apos;ll text a 6-digit code to <strong>{delivery.phone}</strong> so we
            know we can reach you for delivery.
          </p>

          {!otpSent ? (
            <button onClick={sendCode} disabled={busy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send me the code
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              {otpStubbed && (
                <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                  SMS isn&apos;t configured yet, so no text was sent. Ask the shop
                  for your code, or turn off phone confirmation in settings.
                </p>
              )}
              <input
                inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full rounded-xl border-2 border-slate-300 px-4 py-3 text-center text-2xl font-bold tracking-[0.4em]"
              />
              <button onClick={checkCode} disabled={busy || code.length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm &amp; submit order
              </button>
              <button onClick={sendCode} disabled={busy || cooldown > 0}
                className="w-full text-sm text-slate-500 disabled:opacity-50">
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          )}
        </section>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {/* summary + nav */}
      {chosen.length > 0 && step !== "done" && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
              {chosen.length} document{chosen.length === 1 ? "" : "s"}
              {longest > 0 && ` · approx. ${longest} days`}
            </span>
            <span className="text-lg font-bold text-slate-900">{peso(total)}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            All-in — paid before processing
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {idx > 0 && step !== "pay" && (
          <button onClick={() => { setError(null); setStep(steps[idx - 1]); }}
            className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-700">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
        )}
        {step !== "verify" && step !== "pay" && (
          <button
            disabled={busy}
            onClick={() => {
              setError(null);
              if (step === "docs") {
                if (chosen.length === 0) return setError("Please choose at least one document.");
                return setStep("details");
              }
              if (step === "details") {
                const m = missingDetails();
                if (m) return setError(m);
                return setStep("delivery");
              }
              if (step === "delivery") {
                const m = missingDelivery();
                if (m) return setError(m);
                return setStep("review");
              }
              if (step === "review") {
                if (config.otpRequired) return setStep("verify");
                return submit(null);
              }
            }}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {step === "review"
              ? "Confirm — continue to payment"
              : "Continue"}
            {step !== "review" && <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>

      <p className="flex items-start gap-2 px-1 text-center text-xs text-slate-400">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Your details are used only to process your documents, under the Data
          Privacy Act of 2012.
        </span>
      </p>

      {config.messengerUrl && (
        <a href={config.messengerUrl} target="_blank" rel="noopener noreferrer"
           className="flex items-center justify-center gap-2 text-sm text-blue-600">
          <MessageCircle className="h-4 w-4" /> May tanong? Message us instead
        </a>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, inputMode,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; inputMode?: "tel" | "numeric";
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        value={value} placeholder={placeholder} inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
      />
    </div>
  );
}
