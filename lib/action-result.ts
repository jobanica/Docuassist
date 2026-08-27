import { ZodError } from "zod";

/**
 * Result envelope for Server Actions.
 *
 * Next.js redacts the message of any error thrown out of a Server Action in a
 * production build — the browser gets "An error occurred in the Server
 * Components render…" instead. Guard messages are useless if the person who
 * tripped the guard can't read them, so anything the user needs to see comes
 * back as a returned value rather than a throw.
 */
export type ActionResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function toMessage(e: unknown): string {
  if (e instanceof ZodError) {
    // Zod's own .message is a JSON dump of every issue; the first issue's
    // message is the sentence actually written for the user.
    return e.issues[0]?.message ?? "That input isn't valid.";
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}

/** Run an action body, turning a thrown error into a readable returned one. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

/**
 * Client side: turn a failed result back into a throw, so components keep the
 * try/catch they already had and the message survives the round trip.
 */
export function unwrap<T>(r: ActionResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
