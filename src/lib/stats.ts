import type { Entry } from "./entries.js";
import type { Queue } from "./queue.js";
import type { Result } from "./results.js";

/** Monday (UTC) of the week containing `d`, as YYYY-MM-DD. */
export function weekOf(d: Date | string): string {
  const date = new Date(typeof d === "string" && d.length === 10 ? `${d}T00:00:00Z` : d);
  const day = (date.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

function pct(pass: number, total: number): string {
  return total === 0 ? "–" : `${Math.round((pass / total) * 100)}%`;
}

function table(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (r: string[]) => r.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ").trimEnd();
  return [fmt(header), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(fmt)].join("\n");
}

export interface StatsInput {
  entries: Entry[];
  results: Result[];
  queue: Queue;
  rating: number;
  project?: string;
}

export function renderStats({ entries, results, queue, rating, project }: StatsInput): string {
  if (project) {
    entries = entries.filter((e) => e.project === project);
    results = results.filter((r) => r.project === project);
    const ids = new Set(entries.map((e) => e.id));
    queue = Object.fromEntries(Object.entries(queue).filter(([id]) => ids.has(id)));
  }
  if (entries.length === 0 && results.length === 0) {
    return project ? `No selflore data for project "${project}" yet.` : "No selflore data yet. Work normally; entries appear as you go.";
  }

  const skills = [...new Set([...entries.map((e) => e.skill), ...results.map((r) => r.skill)])].filter(Boolean).sort();
  const weeks = [...new Set([...entries.map((e) => weekOf(e.date)), ...results.map((r) => weekOf(r.ts))])].sort();

  const rows = weeks.map((w) => {
    const wr = results.filter((r) => weekOf(r.ts) === w);
    const pass = (rs: Result[]) => rs.filter((r) => r.grade === "got").length;
    return [
      w,
      String(entries.filter((e) => weekOf(e.date) === w).length),
      String(wr.length),
      pct(pass(wr), wr.length),
      ...skills.map((s) => {
        const sr = wr.filter((r) => r.skill === s);
        return pct(pass(sr), sr.length);
      }),
    ];
  });

  const passes = results.filter((r) => r.grade === "got").length;
  const first = results.filter((r) => !r.is_retest);
  const retest = results.filter((r) => r.is_retest);
  const passCount = (rs: Result[]) => rs.filter((r) => r.grade === "got").length;
  const now = Date.now();
  const backlog = Object.values(queue);
  const overdue = backlog.filter((q) => q.due[0] && new Date(q.due[0]).getTime() <= now).length;
  const observed = results.length ? passes / results.length : null;

  const lines = [
    `selflore stats${project ? ` — ${project}` : ""}`,
    "",
    table(["week of", "entries", "questions", "pass", ...skills.map((s) => `pass:${s}`)], rows),
    "",
    `overall pass rate      ${pct(passes, results.length)} (${passes}/${results.length})`,
    `first-attempt pass     ${pct(passCount(first), first.length)}`,
    `retest pass            ${pct(passCount(retest), retest.length)}`,
    `retest backlog         ${backlog.length} queued, ${overdue} due now`,
    `self-rating            ${rating}/10 (≈${rating * 10}%) vs observed ${observed === null ? "–" : `${Math.round(observed * 100)}%`}`,
  ];
  if (observed !== null && results.length >= 10) {
    const gap = Math.round(observed * 100) - rating * 10;
    if (Math.abs(gap) >= 20)
      lines.push(`                       tests ${gap > 0 ? "rate you higher" : "rate you lower"} than you do; re-rate with \`npx selflore init\` if it holds`);
  }
  return lines.join("\n");
}
