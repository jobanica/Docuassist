/**
 * Batch tag shapes and palette.
 *
 * Kept out of lib/actions/tags.ts because a "use server" module may only
 * export async functions — a constant or a type there fails the build.
 */

export const TAG_COLORS = [
  "slate",
  "blue",
  "emerald",
  "amber",
  "violet",
  "rose",
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export interface Tag {
  id: string;
  name: string;
  color: TagColor;
  /** How many customers carry it — the size of the batch. */
  customer_count: number;
}
