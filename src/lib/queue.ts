import { readJson, writeJson } from "./fsutil.js";
import { paths } from "./paths.js";

export type Grade = "got" | "partial" | "missed";

export const RETEST_OFFSETS_DAYS = [7, 21];
export const PASSES_TO_RETIRE = 2;

export interface QueueItem {
  entry_id: string;
  due: string[]; // ISO timestamps still pending, ascending
  streak: number; // consecutive passes on retests
  added_at: string;
}

export type Queue = Record<string, QueueItem>;

const DAY = 24 * 60 * 60 * 1000;

export function schedule(now: Date): string[] {
  return RETEST_OFFSETS_DAYS.map((d) => new Date(now.getTime() + d * DAY).toISOString());
}

/**
 * Apply one graded answer to the queue (pure).
 * - miss/partial: (re)enter the queue with fresh +7d/+21d dates and streak 0.
 * - pass on a queued item: streak++, consume the earliest due date; retire at 2 consecutive passes.
 * - pass on an item not in the queue: nothing to do.
 */
export function applyGrade(queue: Queue, entryId: string, grade: Grade, now: Date): Queue {
  const next = { ...queue };
  const item = next[entryId];
  if (grade !== "got") {
    next[entryId] = { entry_id: entryId, due: schedule(now), streak: 0, added_at: item?.added_at ?? now.toISOString() };
    return next;
  }
  if (!item) return next;
  const streak = item.streak + 1;
  if (streak >= PASSES_TO_RETIRE) {
    delete next[entryId];
    return next;
  }
  // Keep at least one future date so the item comes back for its second pass.
  const remaining = item.due.slice(1);
  next[entryId] = {
    ...item,
    streak,
    due: remaining.length ? remaining : [new Date(now.getTime() + RETEST_OFFSETS_DAYS[0] * DAY).toISOString()],
  };
  return next;
}

export function dueItems(queue: Queue, now: Date): QueueItem[] {
  return Object.values(queue)
    .filter((q) => q.due.length > 0 && new Date(q.due[0]).getTime() <= now.getTime())
    .sort((a, b) => a.due[0].localeCompare(b.due[0]));
}

export function readQueue(): Queue {
  return readJson<Queue>(paths.queue(), {});
}

export function writeQueue(q: Queue): void {
  writeJson(paths.queue(), q);
}
