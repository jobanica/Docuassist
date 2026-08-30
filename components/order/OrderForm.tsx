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
  services: Service[];
}

type Step = "docs" | "details" | "delivery" | "verify" | "done";

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
      setStep("done");
    } catch { setError("Network problem. Please try again."); }
    finally { setBusy(false); }
  }

  // ---------- done ----------
  if (step === "done" && trackingCode) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-7 w-7 text-emerald-600" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">Salamat po! 🎉</h2>
        <p className="mt-1 text-sm text-slate-600">
          We received your request. Save this link to check your order any time:
        </p>
        <a
          href={`/track/${trackingCode}`}
          className="mt-4 block rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"
        >
          Track my order
        </a>
        <p className="mt-3 font-mono text-sm text-slate-500">{trackingCode}</p>
        <p className="mt-4 text-xs text-slate-500">
          Total to prepare for cash on delivery: <strong>{peso(total)}</strong>
        </p>
      </div>
    );
  }

  const steps: Step[] = ["docs", "details", "delivery", ...(config.otpRequired ? (["verify"] as Step[]) : [])];
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
                    <input
                      type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                      value={picked[s.id].form_details[f.key] ?? ""}
                      onChange={(e) => setField(s.id, f.key, e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
                    />
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
          <p className="mt-0.5 text-xs text-slate-400">Cash on delivery</p>
        </div>
      )}

      <div className="flex gap-2">
        {idx > 0 && (
          <button onClick={() => { setError(null); setStep(steps[idx - 1]); }}
            className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-700">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
        )}
        {step !== "verify" && (
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
                if (config.otpRequired) return setStep("verify");
                return submit(null);
              }
            }}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {step === "delivery" && !config.otpRequired ? "Submit order" : "Continue"}
            {!(step === "delivery" && !config.otpRequired) && <ChevronRight className="h-4 w-4" />}
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
