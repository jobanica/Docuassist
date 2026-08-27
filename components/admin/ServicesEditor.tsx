"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, X, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/action-result";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { peso } from "@/lib/money";
import {
  updateService,
  createService,
  setServiceActive,
  type ServiceInput,
} from "@/lib/actions/services";
import type { Service, FormFieldDef } from "@/lib/types";

/**
 * Local form state keeps the numeric fields as strings — that is what an
 * <input> gives us, and letting the box go empty while typing must not coerce
 * to 0. They are converted once on save, where zod validates them.
 */
type FormState = {
  code: string;
  name: string;
  price: string;
  processing_days_min: string;
  processing_days_max: string;
  shipping_days_estimate: string;
  active: boolean;
  form_fields: FormFieldDef[];
};

const BLANK: FormState = {
  code: "",
  name: "",
  price: "0",
  processing_days_min: "7",
  processing_days_max: "14",
  shipping_days_estimate: "7",
  active: true,
  form_fields: [],
};

function toInput(f: FormState): ServiceInput {
  return {
    code: f.code,
    name: f.name,
    price: Number(f.price || 0),
    processing_days_min: Number(f.processing_days_min || 0),
    processing_days_max: Number(f.processing_days_max || 0),
    shipping_days_estimate: Number(f.shipping_days_estimate || 0),
    active: f.active,
    form_fields: f.form_fields,
  };
}

export function ServicesEditor({
  services,
  canEdit,
}: {
  services: Service[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Only admins can change services and prices. You can view them here.
        </p>
      )}

      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        Changing a price only affects <strong>new</strong> orders. Every order
        stores the price it was encoded at, so past orders and all sales figures
        stay exactly as they were.
      </p>

      {services.map((s) => (
        <ServiceRow key={s.id} service={s} canEdit={canEdit} />
      ))}

      {canEdit &&
        (adding ? (
          <ServiceForm
            initial={BLANK}
            title="New service"
            onCancel={() => setAdding(false)}
            onSave={async (v) => {
              unwrap(await createService(toInput(v)));
              setAdding(false);
            }}
          />
        ) : (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add a service
          </Button>
        ))}
    </div>
  );
}

function ServiceRow({
  service,
  canEdit,
}: {
  service: Service;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <ServiceForm
        initial={{
          code: service.code,
          name: service.name,
          price: String(service.price),
          processing_days_min: String(service.processing_days_min),
          processing_days_max: String(service.processing_days_max),
          shipping_days_estimate: String(service.shipping_days_estimate),
          active: service.active,
          form_fields: service.form_fields ?? [],
        }}
        title={`Edit ${service.name}`}
        onCancel={() => setEditing(false)}
        onSave={async (v) => {
          unwrap(await updateService(service.id, toInput(v)));
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 ${
        service.active ? "" : "opacity-60"
      }`}
    >
      <div className="min-w-0">
        <p className="font-medium text-slate-900">
          {service.name}
          {!service.active && (
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600">
              disabled
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">
          <span className="font-mono">{service.code}</span> ·{" "}
          {service.processing_days_min}–{service.processing_days_max}d
          processing · {service.shipping_days_estimate}d shipping ·{" "}
          {(service.form_fields ?? []).length} form field
          {(service.form_fields ?? []).length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-lg font-semibold text-slate-900">
          {peso(service.price)}
        </span>
        {canEdit && (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  unwrap(await setServiceActive(service.id, !service.active));
                  router.refresh();
                })
              }
            >
              {service.active ? "Disable" : "Enable"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ServiceForm({
  initial,
  title,
  onSave,
  onCancel,
}: {
  initial: FormState;
  title: string;
  onSave: (v: FormState) => Promise<void>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState<FormState>({ ...initial });
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fields = v.form_fields;
  const set = (patch: Partial<FormState>) => setV({ ...v, ...patch });
  const setFields = (f: FormFieldDef[]) => setV({ ...v, form_fields: f });

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await onSave(v);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border-2 border-[#2a78d6]/30 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-slate-900">{title}</p>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Fld label="Service name">
          <Input value={v.name} onChange={(e) => set({ name: e.target.value })} />
        </Fld>
        <Fld label="Code (internal, lowercase)">
          <Input
            value={v.code}
            onChange={(e) => set({ code: e.target.value })}
            placeholder="e.g. nbi_clearance"
            className="font-mono"
          />
        </Fld>
        <Fld label="Price (₱)">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={v.price}
            onChange={(e) => set({ price: e.target.value })}
          />
        </Fld>
        <Fld label="Shipping days (estimate)">
          <Input
            type="number"
            min={0}
            value={v.shipping_days_estimate}
            onChange={(e) => set({ shipping_days_estimate: e.target.value })}
          />
        </Fld>
        <Fld label="Processing days — min">
          <Input
            type="number"
            min={0}
            value={v.processing_days_min}
            onChange={(e) => set({ processing_days_min: e.target.value })}
          />
        </Fld>
        <Fld label="Processing days — max">
          <Input
            type="number"
            min={0}
            value={v.processing_days_max}
            onChange={(e) => set({ processing_days_max: e.target.value })}
          />
        </Fld>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={v.active}
          onChange={(e) => set({ active: e.target.checked })}
        />
        Offered to customers (shows on the new-order screen)
      </label>

      {/* Form fields — what staff must encode for this document */}
      <div className="rounded-lg border">
        <button
          type="button"
          onClick={() => setFieldsOpen(!fieldsOpen)}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium"
        >
          {fieldsOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Form fields ({fields.length})
          <span className="ml-1 font-normal text-slate-400">
            — what staff fills in for this document
          </span>
        </button>

        {fieldsOpen && (
          <div className="space-y-2 border-t p-3">
            {fields.map((f, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_110px_90px_36px]">
                <Input
                  placeholder="key"
                  className="font-mono text-xs"
                  value={f.key}
                  onChange={(e) => {
                    const n = [...fields];
                    n[i] = { ...f, key: e.target.value };
                    setFields(n);
                  }}
                />
                <Input
                  placeholder="Label shown to staff"
                  value={f.label}
                  onChange={(e) => {
                    const n = [...fields];
                    n[i] = { ...f, label: e.target.value };
                    setFields(n);
                  }}
                />
                <select
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  value={f.type}
                  onChange={(e) => {
                    const n = [...fields];
                    n[i] = { ...f, type: e.target.value as FormFieldDef["type"] };
                    setFields(n);
                  }}
                >
                  <option value="text">text</option>
                  <option value="date">date</option>
                  <option value="number">number</option>
                  <option value="textarea">long text</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => {
                      const n = [...fields];
                      n[i] = { ...f, required: e.target.checked };
                      setFields(n);
                    }}
                  />
                  required
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFields(fields.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setFields([
                  ...fields,
                  { key: "", label: "", type: "text", required: false, synonyms: [] },
                ])
              }
            >
              <Plus className="h-4 w-4" /> Add field
            </Button>
            <p className="text-xs text-slate-400">
              Keys are used by Paste &amp; Parse — changing a key on an existing
              service won&apos;t rewrite details already saved on past orders.
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          <Save className="h-4 w-4" /> {pending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-600">{label}</Label>
      {children}
    </div>
  );
}
