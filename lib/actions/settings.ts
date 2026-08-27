"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";

/** Admin-only guard for settings mutations (§13). */
async function requireAdmin() {
  const staff = await requireStaff();
  if (staff.role !== "admin") {
    throw new Error("Only admins can change settings.");
  }
  return staff;
}

/** Toggle an SMS event on/off (§10). */
export async function setNotificationEnabled(
  eventKey: string,
  enabled: boolean
): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase
    .from("notification_settings")
    .update({ enabled })
    .eq("event_key", eventKey);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/notifications");
}

/** Edit an SMS template (§10) — templates live in the DB, not in components. */
export async function setNotificationTemplate(
  eventKey: string,
  template: string
): Promise<void> {
  await requireAdmin();
  if (!template.trim()) throw new Error("The template cannot be empty.");
  const supabase = createClient();
  const { error } = await supabase
    .from("notification_settings")
    .update({ template: template.trim() })
    .eq("event_key", eventKey);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/notifications");
}
