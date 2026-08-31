"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  ImageIcon,
  AlertCircle,
} from "lucide-react";
import { fmtDate } from "@/lib/dates";
import { toMessage, unwrap } from "@/lib/action-result";
import { delayFileUrl, type RequirementFile } from "@/lib/actions/files";

/**
 * What the supplier said, shown to the office.
 *
 * Read-only on this side: the person who knows why a job is stuck is the one
 * holding it, so the office chases rather than edits. Moving the order on
 * clears the flag by itself.
 */
export function DelayNotice({
  delayedAt,
  reason,
  files,
}: {
  delayedAt: string | null;
  reason: string | null;
  files: RequirementFile[];
}) {
  const [error, setError] = useState<string | null>(null);
  if (!delayedAt) return null;

  async function open(id: string) {
    setError(null);
    try {
      window.open(unwrap(await delayFileUrl(id)), "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(toMessage(e));
    }
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
        <AlertTriangle className="h-4 w-4" />
        The supplier flagged a delay
        <span className="font-normal text-red-700/80">
          · {fmtDate(delayedAt)}
        </span>
      </p>
      {reason && <p className="mt-1.5 text-sm text-red-900">{reason}</p>}

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-xs">
              {f.mime_type === "application/pdf" ? (
                <FileText className="h-3.5 w-3.5 shrink-0 text-red-400" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-red-400" />
              )}
              <button
                type="button"
                onClick={() => open(f.id)}
                className="min-w-0 flex-1 truncate text-left font-medium text-red-900 hover:underline"
              >
                {f.file_name}
              </button>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-red-300" />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px] text-red-700/80">
        The customer sees this reason on their tracking page. It clears by
        itself once the order moves past Processing.
      </p>
      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
