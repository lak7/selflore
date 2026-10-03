import { splitBody, type Entry } from "./entries.js";
import type { Queue } from "./queue.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local Monday of the week containing `now`, as YYYY-MM-DD. */
export function weekStart(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDate(d);
}

export interface NotesInput {
  entries: Entry[];
  tested: Set<string>;
  queue: Queue;
  now: Date;
  all?: boolean;
  project?: string;
}

export type EntryStatus = "suppressed" | "retest" | "tested" | "untested";

export function entryStatus(e: Entry, tested: Set<string>, queue: Queue): { status: EntryStatus; retest_due: string | null } {
  if (e.suppressed) return { status: "suppressed", retest_due: null };
  if (queue[e.id]) return { status: "retest", retest_due: queue[e.id].due[0] ?? null };
  return { status: tested.has(e.id) ? "tested" : "untested", retest_due: null };
}

function status(e: Entry, tested: Set<string>, queue: Queue): string {
  const s = entryStatus(e, tested, queue);
  return s.status === "retest" ? `retest ${s.retest_due?.slice(0, 10) ?? ""}`.trim() : s.status;
}

/** Plain-text list of captured entries, grouped by day. Defaults to the current week. */
export function renderNotes({ entries, tested, queue, now, all, project }: NotesInput): string {
  const since = weekStart(now);
  let list = entries;
  if (!all) list = list.filter((e) => e.date >= since);
  if (project) list = list.filter((e) => e.project === project);

  const scope = `${all ? "all time" : `week of ${since}`}${project ? ` · ${project}` : ""}`;
  if (list.length === 0) return `selflore notes — ${scope}\n\nNothing captured yet. Work normally; entries appear as you go.`;

  const out = [`selflore notes — ${scope} (${list.length} ${list.length === 1 ? "entry" : "entries"})`];
  let day = "";
  for (const e of [...list].sort((a, b) => a.id.localeCompare(b.id))) {
    if (e.date !== day) {
      day = e.date;
      out.push("", `${DAYS[new Date(`${e.date}T12:00:00`).getDay()]} ${e.date}`);
    }
    const { prose, snippet } = splitBody(e.body);
    const where = [e.project, e.paths.join(", ")].filter(Boolean).join(" · ");
    out.push(`  • [${e.kind} · ${e.skill}] ${where}  (${status(e, tested, queue)})`);
    out.push(`    Q: ${e.testable}`);
    for (const line of prose.split("\n")) if (line.trim()) out.push(`    ${line.trim()}`);
    if (snippet) {
      const lines = snippet.trimEnd().split("\n").length;
      out.push(`    + ${lines}-line snippet${e.commit ? ` @ ${e.commit}` : ""}`);
    }
    out.push(`    id: ${e.id}`);
  }
  return out.join("\n");
}
