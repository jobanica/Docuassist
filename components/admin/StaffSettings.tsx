"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Copy,
  Check,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  X,
  MessageCircle,
  Lock,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toMessage, type ActionResult, unwrap } from "@/lib/action-result";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/dates";
import {
  createStaffAccount,
  resetStaffPassword,
  setStaffActive,
  deleteStaffAccount,
  setStaffMessengerPage,
  setStaffServices,
  setStaffRole,
  type StaffRow,
} from "@/lib/actions/staff";
import type { MessengerPage, Service } from "@/lib/types";

/** Readable password: two Filipino-ish words + 4 digits. Easy to dictate. */
const WORDS = [
  "Sinag", "Dalisay", "Bagani", "Alab", "Tala", "Maharlika", "Liwayway",
  "Bituin", "Agila", "Hiyas", "Marikit", "Payapa", "Silangan", "Amihan",
];
function generatePassword() {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  let a = pick();
  let b = pick();
  while (b === a) b = pick();
  const n = 1000 + Math.floor(Math.random() * 9000);
  return `${a}-${b}-${n}`;
}

export function StaffSettings({
  staff,
  meId,
  messengerPages,
  services,
}: {
  staff: StaffRow[];
  meId: string;
  messengerPages: MessengerPage[];
  services: Service[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Newly created account — shown once so the admin can copy the password.
  const [justCreated, setJustCreated] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [resetFor, setResetFor] = useState<StaffRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: generatePassword(),
    role: "staff" as "admin" | "staff",
  });

  function run(fn: () => Promise<ActionResult<unknown>>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await fn());
        after?.();
        router.refresh();
      } catch (e) {
        setError(toMessage(e));
      }
    });
  }

  function create(e: React.FormEvent) {
    e.preventDefault();
    const snapshot = { email: form.email.trim(), password: form.password };
    run(
      () => createStaffAccount({ ...form, email: snapshot.email }),
      () => {
        setJustCreated(snapshot);
        setForm({
          name: "",
          email: "",
          password: generatePassword(),
          role: "staff",
        });
      }
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Give each staff member their own login. Staff see Orders and Customers;
        only admins see the sales dashboard and these settings.
      </p>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {justCreated && (
        <NewAccountCard
          email={justCreated.email}
          password={justCreated.password}
          onDismiss={() => setJustCreated(null)}
        />
      )}

      {/* Create */}
      <form
        onSubmit={create}
        className="space-y-4 rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]"
      >
        <p className="font-medium text-slate-900">Add a staff account</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600">Full name</span>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Maria Santos"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600">Email</span>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="maria@example.com"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600">
              Temporary password
            </span>
            <div className="flex gap-2">
              <Input
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Generate a new password"
                onClick={() =>
                  setForm({ ...form, password: generatePassword() })
                }
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600">Role</span>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as "admin" | "staff" })
              }
            >
              <option value="staff">Staff — Orders &amp; Customers</option>
              <option value="admin">Admin — everything, incl. sales</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-slate-500">
          You hand them this password yourself — no email is sent. They can keep
          it or you can reset it here any time.
        </p>
        <Button type="submit" disabled={pending}>
          <UserPlus className="h-4 w-4" />
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>

      {/* List */}
      {/* overflow-x-auto, not overflow-hidden: this table is wider than the
          card on a laptop, and hidden meant the Actions column was simply
          unreachable — no scrollbar, no way to drag to it. */}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Role</th>
              <th className="px-3 py-3 font-medium">Documents</th>
              {messengerPages.length > 1 && (
                <th className="px-3 py-3 font-medium">Facebook page</th>
              )}
              <th className="px-3 py-3 font-medium">Added</th>
              <th className="px-3 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const isMe = s.id === meId;
              return (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {s.name}
                      </span>
                      {isMe && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          you
                        </span>
                      )}
                      {!s.active && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                          Deactivated
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{s.email ?? "—"}</div>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
                      value={s.role}
                      disabled={pending || isMe || !s.active}
                      title={
                        isMe ? "You can't change your own role." : undefined
                      }
                      onChange={(e) =>
                        run(() =>
                          setStaffRole(
                            s.id,
                            e.target.value as "admin" | "staff"
                          )
                        )
                      }
                    >
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <ScopeCell
                      staff={s}
                      services={services}
                      disabled={pending || isMe || !s.active}
                      isMe={isMe}
                      onSave={(ids) => run(() => setStaffServices(s.id, ids))}
                    />
                  </td>
                  {messengerPages.length > 1 && (
                    <td className="px-3 py-3">
                      <select
                        className="h-9 max-w-[190px] rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
                        value={s.default_messenger_page_id ?? ""}
                        disabled={pending || !s.active}
                        onChange={(e) =>
                          run(() =>
                            setStaffMessengerPage(s.id, e.target.value || null)
                          )
                        }
                      >
                        <option value="">Business default</option>
                        {messengerPages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="px-3 py-3 text-slate-500">
                    {fmtDate(s.created_at)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setResetFor(s)}
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Reset
                      </Button>
                      {!isMe && (
                        <Button
                          size="sm"
                          variant={s.active ? "outline" : "default"}
                          disabled={pending}
                          onClick={() => run(() => setStaffActive(s.id, !s.active))}
                        >
                          {s.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      )}
                      {!isMe &&
                        (confirmDelete === s.id ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => setConfirmDelete(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 text-white hover:bg-red-700"
                              disabled={pending}
                              onClick={() =>
                                run(() => deleteStaffAccount(s.id), () =>
                                  setConfirmDelete(null)
                                )
                              }
                            >
                              Delete {s.name}?
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-slate-500 hover:bg-red-50 hover:text-red-700"
                            disabled={pending}
                            onClick={() => setConfirmDelete(s.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Limiting someone to certain documents hides every other order,
          customer and SMS log from them — in the database, not just on screen,
          so it holds however they reach the data. They also can&apos;t encode
          an order for a document they&apos;re not on. Leave it at{" "}
          <strong>All documents</strong> for staff who handle everything.
        </span>
      </p>

      {messengerPages.length > 1 && (
      <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          The Facebook page is what new orders this person encodes will point
          their tracking link at — so the VA on a separate page doesn&apos;t
          have to switch it every time. It stays changeable per order.
        </span>
      </p>
      )}

      <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Deactivating signs the person out everywhere immediately and blocks
          them in the database, not just in this app. Their name stays on the
          orders they handled, so the history stays honest — that&apos;s why
          accounts are deactivated rather than deleted.
        </span>
      </p>

      {resetFor && (
        <ResetPasswordDialog
          staff={resetFor}
          pending={pending}
          error={error}
          onClose={() => setResetFor(null)}
          onSubmit={(pw, done) =>
            run(() => resetStaffPassword(resetFor.id, pw), done)
          }
        />
      )}
    </div>
  );
}

function NewAccountCard({
  email,
  password,
  onDismiss,
}: {
  email: string;
  password: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-emerald-900">Account created</p>
          <p className="mt-0.5 text-xs text-emerald-800">
            Send these to them now — the password isn&apos;t shown again. If it
            gets lost, use Reset password.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 space-y-1 rounded-lg bg-white p-3 font-mono text-sm text-slate-800">
        <p>{email}</p>
        <p>{password}</p>
      </div>
      <Button size="sm" variant="outline" className="mt-2" onClick={copy}>
        {copied ? (
          <>
            <Check className="h-4 w-4" /> Copied!
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" /> Copy login details
          </>
        )}
      </Button>
    </div>
  );
}

function ResetPasswordDialog({
  staff,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  staff: StaffRow;
  pending: boolean;
  /** Repeated here because the page-level banner sits behind the overlay. */
  error: string | null;
  onClose: () => void;
  onSubmit: (password: string, done: () => void) => void;
}) {
  const [pw, setPw] = useState(generatePassword());
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-slate-900">
              Reset password for {staff.name}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Their old password stops working right away.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <Input
            className="font-mono"
            minLength={8}
            value={pw}
            disabled={done}
            onChange={(e) => setPw(e.target.value)}
          />
          {!done && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Generate a new password"
              onClick={() => setPw(generatePassword())}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {done ? (
            <>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(pw);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copy password
                  </>
                )}
              </Button>
              <Button onClick={onClose}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={pending || pw.length < 8}
                onClick={() => onSubmit(pw, () => setDone(true))}
              >
                <KeyRound className="h-4 w-4" />
                {pending ? "Saving…" : "Set password"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Which documents one staff member may see. Empty list = everything. */
function ScopeCell({
  staff,
  services,
  disabled,
  isMe,
  onSave,
}: {
  staff: StaffRow;
  services: Service[];
  disabled: boolean;
  isMe: boolean;
  onSave: (serviceIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(staff.service_ids);

  const limited = staff.service_ids.length > 0;
  const names = services
    .filter((s) => staff.service_ids.includes(s.id))
    .map((s) => s.name);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  if (!open) {
    return (
      <div className="max-w-[220px]">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setPicked(staff.service_ids);
            setOpen(true);
          }}
          title={
            isMe ? "You can't limit your own account." : "Change what they see"
          }
          className="flex w-full items-center gap-1.5 rounded-md border border-input px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60"
        >
          {limited ? (
            <>
              <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="truncate">
                {names.length} document{names.length === 1 ? "" : "s"}
              </span>
            </>
          ) : (
            <span className="text-slate-600">All documents</span>
          )}
        </button>
        {limited && (
          <p className="mt-1 truncate text-[11px] text-slate-500" title={names.join(", ")}>
            {names.join(", ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-[240px] space-y-2 rounded-lg border bg-white p-2 shadow-sm">
      <p className="text-[11px] text-slate-500">
        Tick nothing for full access.
      </p>
      <div className="max-h-44 space-y-1 overflow-y-auto">
        {services.map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50"
          >
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={picked.includes(s.id)}
              onChange={() => toggle(s.id)}
            />
            <span className="truncate">{s.name}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            onSave(picked);
            setOpen(false);
          }}
        >
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
