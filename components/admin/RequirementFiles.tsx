"use client";

import { useRef, useState, useTransition } from "react";
import {
  Paperclip,
  Trash2,
  FileText,
  ImageIcon,
  Loader2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { toMessage, unwrap } from "@/lib/action-result";
import {
  deleteRequirement,
  requirementUrl,
  uploadRequirement,
  type RequirementFile,
} from "@/lib/actions/files";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

function prettySize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The requirements attached to one ID application — a valid ID, a birth
 * certificate, whatever that document happens to need.
 *
 * Always optional. Nothing here blocks an order from moving on, and an empty
 * list says so rather than warning about it.
 *
 * The supplier gets the same component read-only: they need to see the papers
 * to do the work, but the office is who collects them.
 */
export function RequirementFiles({
  itemId,
  orderId,
  initial,
  canEdit = true,
}: {
  itemId: string;
  orderId: string;
  initial: RequirementFile[];
  /** False for the supplier: they may look, not add or remove. */
  canEdit?: boolean;
}) {
  const [files, setFiles] = useState<RequirementFile[]>(initial);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const f of Array.from(list)) {
        if (f.size > MAX_BYTES) {
          throw new Error(
            `“${f.name}” is over 10MB. Send a photo of it rather than the original scan.`
          );
        }
        const data = await toBase64(f);
        const row = unwrap(
          await uploadRequirement(
            itemId,
            orderId,
            f.name,
            f.type || "application/octet-stream",
            data
          )
        );
        setFiles((prev) => [...prev, row]);
      }
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function open(id: string) {
    setError(null);
    setOpening(id);
    try {
      const url = unwrap(await requirementUrl(id));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setOpening(null);
    }
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await deleteRequirement(id, orderId));
        setFiles((prev) => prev.filter((f) => f.id !== id));
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
          <Paperclip className="h-3.5 w-3.5" />
          Requirements
          <span className="font-normal text-muted-foreground">
            {files.length > 0
              ? `· ${files.length} attached`
              : "· optional"}
          </span>
        </p>

        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => add(e.target.files)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/50 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Paperclip className="h-3.5 w-3.5" /> Add files
                </>
              )}
            </button>
          </>
        )}
      </div>

      {files.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {canEdit
            ? "A valid ID, a birth certificate — whatever the customer sent. Not required to create or move the order."
            : "Nothing attached to this one."}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {files.map((f) => {
            const isPdf = f.mime_type === "application/pdf";
            return (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs"
              >
                {isPdf ? (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
                <button
                  type="button"
                  onClick={() => open(f.id)}
                  className="min-w-0 flex-1 truncate text-left font-medium text-slate-800 hover:underline"
                  title={f.file_name}
                >
                  {f.file_name}
                </button>
                <span className="shrink-0 text-slate-400">
                  {prettySize(f.size_bytes)}
                </span>
                {opening === f.id ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                )}
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(f.id)}
                    title={`Remove ${f.file_name}`}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-white hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Read a picked file as base64 for the Server Action to carry. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error(`Could not read “${file.name}”.`));
    r.onload = () => {
      const s = String(r.result ?? "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    r.readAsDataURL(file);
  });
}
