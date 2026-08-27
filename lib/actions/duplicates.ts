"use server";

import { run, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { normalizePhPhone } from "@/lib/sms/phone";
import type { Customer, StatusCode } from "@/lib/types";

/**
 * Duplicate detection for order intake.
 *
 * The same request arrives twice more often than you'd think: a customer
 * messages again after not hearing back, or two staff pick up the same thread.
 * Encoding it twice means paying PSA twice and shipping twice, so the New Order
 * screen checks before it creates anything.
 *
 * This never blocks — it warns. Some repeats are real (a customer genuinely
 * ordering a second copy), and only the person reading the conversation can
 * tell the difference.
 */

export interface DuplicateMatch {
  order_id: string;
  tracking_code: string;
  status: StatusCode;
  status_label: string;
  created_at: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  service_names: string[];
  /** Documents on that order that are also being ordered now. */
  overlapping: string[];
  matched_on: ("phone" | "name")[];
  /** strong = same document, still live or only just finished. */
  severity: "strong" | "possible";
}

export interface DuplicateReport {
  matches: DuplicateMatch[];
  /** Customer rows already on file for this name/phone, to reuse instead of
   *  creating a second record for the same person. */
  existingCustomers: Customer[];
}

/** Case- and spacing-insensitive name key. */
function nameKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

const LOOKBACK_DAYS = 90;
/** A finished order this recent, for the same document, still reads as a repeat. */
const RECENTLY_FINISHED_DAYS = 14;

export async function findDuplicateOrders(input: {
  full_name: string;
  phone?: string | null;
  /** Customer already picked from the list, if any — matched directly. */
  customer_id?: string | null;
  service_ids: string[];
}): Promise<ActionResult<DuplicateReport>> {
  return run(async () => {
    await requireStaff();
    const supabase = createClient();

    const name = nameKey(input.full_name ?? "");
    const phone = normalizePhPhone(input.phone);
    // Last 9 digits match 09XXXXXXXXX and +639XXXXXXXXX alike, so a number
    // saved in either form is still found.
    const phoneTail = phone ? phone.slice(-9) : null;

    if (!name && !phoneTail && !input.customer_id) {
      return { matches: [], existingCustomers: [] };
    }

    // --- Candidate customers ---
    const ors: string[] = [];
    if (name) ors.push(`full_name.ilike.${name.replace(/[,()]/g, " ")}`);
    if (phoneTail) ors.push(`phone.ilike.%${phoneTail}%`);

    let candidates: Customer[] = [];
    if (ors.length) {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .or(ors.join(","))
        .limit(25);
      if (error) throw new Error(error.message);
      candidates = (data ?? []) as Customer[];
    }

    // Confirm in JS — ilike can't normalize spacing or phone formatting.
    const matchedOn = new Map<string, ("phone" | "name")[]>();
    const existingCustomers = candidates.filter((c) => {
      const on: ("phone" | "name")[] = [];
      if (phone && normalizePhPhone(c.phone) === phone) on.push("phone");
      if (name && nameKey(c.full_name) === name) on.push("name");
      if (on.length) matchedOn.set(c.id, on);
      return on.length > 0;
    });

    const customerIds = new Set(existingCustomers.map((c) => c.id));
    if (input.customer_id) customerIds.add(input.customer_id);
    if (customerIds.size === 0) {
      return { matches: [], existingCustomers: [] };
    }

    // --- Their recent orders ---
    const since = new Date(
      Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const [{ data: orders, error: ordErr }, { data: statuses }] =
      await Promise.all([
        supabase
          .from("orders")
          .select(
            `id, tracking_code, status, created_at, customer_id,
             customers ( full_name, phone ),
             order_items ( service_id, services ( name ) )`
          )
          .in("customer_id", Array.from(customerIds))
          .neq("status", "cancelled")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(25),
        supabase.from("order_statuses").select("code, label"),
      ]);
    if (ordErr) throw new Error(ordErr.message);

    const label = new Map(
      (statuses ?? []).map((s) => [s.code, s.label as string])
    );
    const wanted = new Set(input.service_ids);
    const finishedCutoff =
      Date.now() - RECENTLY_FINISHED_DAYS * 24 * 60 * 60 * 1000;

    const matches: DuplicateMatch[] = (orders ?? []).map((o: any) => {
      const names: string[] = [];
      const overlapping: string[] = [];
      for (const it of o.order_items ?? []) {
        const n = it.services?.name;
        if (!n) continue;
        names.push(n);
        if (wanted.has(it.service_id)) overlapping.push(n);
      }
      const live = !["delivered", "returned"].includes(o.status);
      const justFinished = new Date(o.created_at).getTime() >= finishedCutoff;
      return {
        order_id: o.id,
        tracking_code: o.tracking_code,
        status: o.status as StatusCode,
        status_label: label.get(o.status) ?? o.status,
        created_at: o.created_at,
        customer_id: o.customer_id,
        customer_name: o.customers?.full_name ?? "—",
        customer_phone: o.customers?.phone ?? null,
        service_names: names,
        overlapping,
        matched_on:
          matchedOn.get(o.customer_id) ??
          (o.customer_id === input.customer_id ? ["name"] : []),
        severity:
          overlapping.length > 0 && (live || justFinished)
            ? "strong"
            : "possible",
      };
    });

    matches.sort((a, b) =>
      a.severity === b.severity
        ? b.created_at.localeCompare(a.created_at)
        : a.severity === "strong"
          ? -1
          : 1
    );

    return { matches, existingCustomers };
  });
}
