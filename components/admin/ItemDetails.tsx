"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, Check, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateOrderItemDetails } from "@/lib/actions/orders";
import type { FormFieldDef } from "@/lib/types";

/**
 * The details attached to one order item.
 *
 * Two shapes reach this component, because there are two ways an order is
 * created. A customer using the order link fills the structured fields
 * directly. Staff encoding from Messenger paste the reply verbatim — so the
 * structured fields start empty and are filled here, when there is a PSA form
 * to print.
 */
export function ItemDetails({
  itemId,
  fields,
  formDetails,
  pastedDetails,
}: {
  itemId: string;
  fields: FormFieldDef[];
  formDetails: Record<string, string>;
  pastedDetails: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [editingPaste, setEditingPaste] = useState(false);
  const [paste, setPaste] = useState(pastedDetails ?? "");
  const [copied, setCopied] = useState(false);

  const filledCount = fields.filter((f) => formDetails[f.key]?.trim()).length;
  // Open the print fields by default only when there is nothing in them yet
  // and there is a paste to copy across.
  const [openFields, setOpenFields] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(formDetails);

  function save(patch: Parameters<typeof updateOrderItemDetails>[1], done?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await updateOrderItemDetails(itemId, patch);
        done?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  async function copyPaste() {
    try {
      await navigator.clipboard.writeText(paste);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-3">
      {/* --- The customer's reply, as sent --- */}
      {(pastedDetails || editingPaste) && (
        <div className="rounded-md bg-muted/50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Customer&apos;s filled-out form
            </p>
            <div className="flex gap-1">
              {!editingPaste && (
                <>
                  <button
                    onClick={copyPaste}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-background"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setEditingPaste(true)}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-background"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </>
              )}
            </div>
          </div>

          {editingPaste ? (
            <div className="space-y-2">
              <Textarea
                rows={10}
                className="bg-background font-mono text-xs"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    save({ pasted_details: paste }, () => setEditingPaste(false))
                  }
                >
                  <Save className="h-3.5 w-3.5" />
                  {pending ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPaste(pastedDetails ?? "");
                    setEditingPaste(false);
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
              {pastedDetails}
            </pre>
          )}
        </div>
      )}

      {/* --- Structured fields, used to fill the printable PSA form --- */}
      {fields.length > 0 && (
        <div className="rounded-md border">
          <button
            type="button"
            onClick={() => setOpenFields((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-accent/40"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${openFields ? "" : "-rotate-90"}`}
              />
              PSA form fields
            </span>
            <span
              className={
                filledCount === 0 ? "text-amber-700" : "text-muted-foreground"
              }
            >
              {filledCount === 0
                ? "empty — fill before printing"
                : `${filledCount} of ${fields.length} filled`}
            </span>
          </button>

          {openFields && (
            <div className="space-y-3 border-t p-3">
              <p className="text-xs text-muted-foreground">
                These fill the printable PSA form. Copy them across from the
                reply above — what you type here is what gets printed.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((f) => (
                  <div
                    key={f.key}
                    className={`space-y-1 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}
                  >
                    <Label className="text-xs">
                      {f.required ? `${f.label} *` : f.label}
                    </Label>
                    {f.type === "textarea" ? (
                      <Textarea
                        rows={2}
                        value={values[f.key] ?? ""}
                        onChange={(e) =>
                          setValues({ ...values, [f.key]: e.target.value })
                        }
                      />
                    ) : (
                      <Input
                        className="h-9"
                        type={
                          f.type === "number"
                            ? "number"
                            : f.type === "date"
                              ? "date"
                              : "text"
                        }
                        value={values[f.key] ?? ""}
                        onChange={(e) =>
                          setValues({ ...values, [f.key]: e.target.value })
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => save({ form_details: values })}
              >
                <Save className="h-3.5 w-3.5" />
                {pending ? "Saving…" : "Save form fields"}
              </Button>
            </div>
          )}
        </div>
      )}

      {!pastedDetails && filledCount === 0 && (
        <p className="text-xs text-muted-foreground">
          No details recorded yet.
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
