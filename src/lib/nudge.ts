import type { Config } from "./config.js";

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Overdue = there is material and a week has passed since the last test (or since the first entry, before any test). */
export function testOverdue(config: Config, oldestEntryDate: string | null, now: Date): boolean {
  if (!oldestEntryDate) return false;
  const since = config.last_test_at ?? `${oldestEntryDate}T00:00:00`;
  return now.getTime() - new Date(since).getTime() > WEEK;
}

export function sessionStartContext(sessionId: string | undefined, config: Config, oldestEntryDate: string | null, now: Date): string {
  const lines: string[] = [];
  if (sessionId) lines.push(`selflore session_id=${sessionId}`);
  if (config.nudge && testOverdue(config, oldestEntryDate, now))
    lines.push("selflore: weekly test overdue — mention once that the user can run /selflore test (~20 min).");
  return lines.join("\n");
}
