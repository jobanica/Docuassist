import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import {
  NotificationSettings,
  type NotificationRow,
} from "@/components/admin/NotificationSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

const ORDER = ["details_received", "shipped", "failed_attempt", "delivered"];

const statusTone: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700",
  stubbed: "bg-slate-100 text-slate-600",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-amber-100 text-amber-800",
};

export default async function NotificationSettingsPage() {
  const staff = await requireStaff();
  const supabase = createClient();

  const [{ data: settings }, { data: logs }] = await Promise.all([
    supabase.from("notification_settings").select("*"),
    supabase
      .from("notifications_log")
      .select("id, type, phone, status, response, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const rows = ((settings ?? []) as NotificationRow[]).sort(
    (a, b) => ORDER.indexOf(a.event_key) - ORDER.indexOf(b.event_key)
  );

  const smsConfigured = Boolean(process.env.SEMAPHORE_API_KEY);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Semaphore SMS to customers. Messenger stays the primary channel — SMS is
        the backup that doesn&apos;t need the customer to open Messenger.
      </p>

      {!smsConfigured && (
        <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">
          <strong>Stub mode:</strong> <code>SEMAPHORE_API_KEY</code> isn&apos;t
          set, so messages are logged below with status{" "}
          <em>stubbed</em> instead of being sent. Add the key to{" "}
          <code>.env.local</code> to send for real.
        </p>
      )}

      <NotificationSettings rows={rows} canEdit={staff.role === "admin"} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent sends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y text-sm">
            {(logs ?? []).map((l: any) => (
              <div key={l.id} className="flex items-start gap-3 py-2">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    statusTone[l.status] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {l.status}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {l.type} · {l.phone ?? "no number"} ·{" "}
                    {fmtDateTime(l.created_at)}
                  </p>
                  <p className="truncate">{l.response}</p>
                </div>
              </div>
            ))}
            {(logs ?? []).length === 0 && (
              <p className="py-6 text-center text-muted-foreground">
                No SMS activity yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
