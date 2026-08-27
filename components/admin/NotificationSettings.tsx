"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unwrap, type ActionResult } from "@/lib/action-result";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  setNotificationEnabled,
  setNotificationTemplate,
} from "@/lib/actions/settings";

export interface NotificationRow {
  event_key: string;
  enabled: boolean;
  template: string;
}

const META: Record<
  string,
  { title: string; when: string; priority?: string }
> = {
  details_received: {
    title: "Order confirmed",
    when: "Sent when an order is encoded as “Details received”.",
  },
  shipped: {
    title: "Shipped",
    when: "Sent when you enter the courier and tracking number.",
  },
  failed_attempt: {
    title: "Failed delivery attempt",
    when: "Sent each time you log a failed attempt (1/3, 2/3, 3/3).",
    priority:
      "Highest-priority SMS in the system — every recovered attempt is a saved sale. Keep this ON.",
  },
  delivered: {
    title: "Delivered (thank-you)",
    when: "Optional. Sent when an order is marked delivered.",
  },
};

const TOKENS = "{name} {link} {total} {courier} {number} {n}";

export function NotificationSettings({
  rows,
  canEdit,
}: {
  rows: NotificationRow[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="flex items-center gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Only admins can change these settings. You can view them here.
        </p>
      )}
      {rows.map((row) => (
        <EventCard key={row.event_key} row={row} canEdit={canEdit} />
      ))}
    </div>
  );
}

function EventCard({
  row,
  canEdit,
}: {
  row: NotificationRow;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [template, setTemplate] = useState(row.template);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const meta = META[row.event_key] ?? {
    title: row.event_key,
    when: "",
  };
  const dirty = template.trim() !== row.template.trim();

  function run(fn: () => Promise<ActionResult<unknown>>, markSaved = false) {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await fn());
        if (markSaved) {
          setSaved(true);
          setTimeout(() => setSaved(false), 1800);
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">{meta.title}</p>
            <p className="text-xs text-muted-foreground">{meta.when}</p>
            {meta.priority && (
              <p className="mt-1 text-xs font-medium text-emerald-700">
                {meta.priority}
              </p>
            )}
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={row.enabled}
              disabled={!canEdit || pending}
              onChange={(e) =>
                run(() => setNotificationEnabled(row.event_key, e.target.checked))
              }
            />
            {row.enabled ? "On" : "Off"}
          </label>
        </div>

        <Textarea
          rows={3}
          value={template}
          disabled={!canEdit}
          onChange={(e) => setTemplate(e.target.value)}
          className="text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Tokens: <span className="font-mono">{TOKENS}</span>
          </p>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              disabled={!dirty || pending}
              onClick={() =>
                run(
                  () => setNotificationTemplate(row.event_key, template),
                  true
                )
              }
            >
              <Save className="h-4 w-4" />
              {saved ? "Saved!" : pending ? "Saving…" : "Save template"}
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
