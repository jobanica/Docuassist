"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Paperclip,
  Loader2,
  AlertCircle,
  Check,
  X,
  ImageIcon,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toMessage, unwrap } from "@/lib/action-result";
import { markDelayed } from "@/lib/actions/supplier";
import {
  delayFileUrl,
  uploadDelayFile,
  type RequirementFile,
} from "@/lib/actions/files";

const MAX_REASON = 300;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

/**
 * The supplier saying a job is held up, and why.
 *
 * The reason goes onto the customer's tracking page word for word, which is
 * said on the panel itself — someone typing "waiting for RDO, walang tao" for
 * a colleague should know the customer reads it too.
 */
export function DelayPanel({
  orderId,
  delayedAt,
  reason,
  files,
}: {
  orderId: string;
  delayedAt: string | null;
  reason: string | null;
  files: RequirementFile[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(reason ?? "");
  const [list, setList] = useState<RequirementFile[]>(files);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDelayed = Boolean(delayedAt);

  function save(next: string) {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await markDelayed(orderId, next));
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  async function attach(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const f of Array.from(picked)) {
        const data = await toBase64(f);
        const row = unwrap(
          await uploadDelayFile(
            orderId,
            f.name,
            f.type || "application/octet-stream",
            data
          )
        );
        setList((prev) => [...prev, row]);
      }
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function openFile(id: string) {
    setError(null);
    try {
      window.open(unwrap(await delayFileUrl(id)), "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(toMessage(e));
    }
  }

  // --- Already flagged: show it, with a way to change or lift it -------------
  if (isDelayed && !open) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-red-800">
          <AlertTriangle className="h-3.5 w-3.5" /> Marked as delayed
        </p>
        <p className="mt-1 text-sm text-red-900">{reason}</p>
        {list.length > 0 && <FileList files={list} onOpen={openFile} />}
        <p className="mt-2 text-[11px] text-red-700/80">
          The customer can see this reason on their tracking page.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setText(reason ?? ""); setOpen(true); }}
            className="rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100"
          >
            Change the reason
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => save("")}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" /> No longer delayed
          </button>
        </div>
        {error && <Err msg={error} />}
      </div>
    );
  }

  // --- Not flagged, and not writing one --------------------------------------
  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50"
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Mark as delayed
        </button>
        {error && <Err msg={error} />}
      </div>
    );
  }

  // --- Writing the reason -----------------------------------------------------
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <label
        htmlFor={`delay-${orderId}`}
        className="text-xs font-semibold text-amber-900"
      >
        Why is it held up?
      </label>
      <p className="mb-2 mt-0.5 text-[11px] text-amber-800/90">
        The customer reads this on their tracking page, so write it for them.
      </p>
      <Textarea
        id={`delay-${orderId}`}
        rows={3}
        maxLength={MAX_REASON}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. The RDO is closed for the week — the release moves to next Monday."
        className="bg-white text-sm"
      />
      <p className="mt-1 text-right text-[11px] text-amber-800/70">
        {text.length}/{MAX_REASON}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => attach(e.target.files)}
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !text.trim()} onClick={() => save(text)}>
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5" /> Save
            </>
          )}
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-accent/40 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Paperclip className="h-3.5 w-3.5" /> Add a photo
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setText(reason ?? ""); setError(null); }}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-amber-900 hover:bg-amber-100"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>

      {list.length > 0 && <FileList files={list} onOpen={openFile} />}
      <p className="mt-2 text-[11px] text-amber-800/80">
        A photo is optional, and only the office sees it — the customer gets the
        words.
      </p>
      {error && <Err msg={error} />}
    </div>
  );
}

function FileList({
  files,
  onOpen,
}: {
  files: RequirementFile[];
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="mt-2 space-y-1">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-2 text-xs">
          {f.mime_type === "application/pdf" ? (
            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          )}
          <button
            type="button"
            onClick={() => onOpen(f.id)}
            className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
          >
            {f.file_name}
          </button>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        </li>
      ))}
    </ul>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {msg}
    </p>
  );
}

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
