import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  BALANCES,
  configExists,
  designShare,
  describeFocus,
  effectiveFocus,
  FOCUS_MODES,
  readConfig,
  writeConfig,
  type Balance,
  type FocusMode,
} from "./config.js";
import {
  inferLevel,
  listEntries,
  MERGE_SIMILARITY,
  parseEntry,
  readEntry,
  similarity,
  uniqueId,
  validateEntry,
  writeEntry,
  type Entry,
} from "./entries.js";
import { applyGrade, dueItems, readQueue, writeQueue, type Grade } from "./queue.js";
import { appendResult, QUESTION_TYPES, readResults, testedEntryIds, type QuestionType } from "./results.js";
import { readSession, writeSession } from "./session.js";
import fs from "node:fs";
import { renderNotes, staleBefore } from "./notes.js";
import { buildNotesData, renderNotesHtml } from "./notes-html.js";
import { openInBrowser } from "./open.js";
import { paths } from "./paths.js";
import { renderStats } from "./stats.js";

export interface CmdResult {
  code: number;
  out: string;
}

const ok = (out: string): CmdResult => ({ code: 0, out });
const fail = (out: string, code = 1): CmdResult => ({ code, out });

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

/** Last two path segments ("selflore/v0"), so same-named folders in different parents stay distinct. */
export function projectName(dir: string): string {
  return path.resolve(dir).split(path.sep).filter(Boolean).slice(-2).join("/") || dir;
}

export function projectInfo(cwd: string): { project: string; commit: string } {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  return {
    project: projectName(top || cwd),
    commit: top ? git(cwd, ["rev-parse", "--short", "HEAD"]) : "",
  };
}

function today(now: Date): string {
  // Local calendar date: an entry logged at 1am belongs to the user's today, not UTC's.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function summarize(e: Entry): string {
  return `- ${e.id} [${e.kind}/${e.level}/${e.skill}] ${e.testable}`;
}

export interface AddOpts {
  session: string;
  cwd: string;
  now?: Date;
}

export interface StoreResult {
  action: "logged" | "updated";
  entry: Entry;
}

/**
 * Find an untested entry this one should be merged into: same project, a shared path,
 * and a similar question. Long sessions keep touching the same area; this keeps one
 * entry per idea instead of a pile of near-duplicates.
 */
export function findMergeTarget(candidate: Pick<Entry, "project" | "paths" | "testable">, tested: Set<string>): Entry | null {
  const queue = readQueue();
  let best: Entry | null = null;
  let bestScore = 0;
  for (const e of listEntries()) {
    if (e.suppressed || e.project !== candidate.project || tested.has(e.id) || queue[e.id]) continue;
    const sharesPath = e.paths.some((p) => candidate.paths.includes(p));
    const score = similarity(e.testable, candidate.testable);
    const threshold = sharesPath ? MERGE_SIMILARITY : 0.8; // without a shared file, only near-identical questions merge
    if (score >= threshold && score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

/** Enrich, merge-or-create and store a validated entry. Shared by `entry add` and the background worker. */
export function storeEntry(parsed: Partial<Entry>, opts: AddOpts): StoreResult {
  const now = opts.now ?? new Date();
  const info = projectInfo(opts.cwd);
  const project = parsed.project ? String(parsed.project) : info.project;
  const commit = parsed.commit ? String(parsed.commit) : info.commit;
  const paths = Array.isArray(parsed.paths) ? parsed.paths.map(String) : [];
  const testable = String(parsed.testable);
  const level = parsed.level ?? inferLevel(parsed.kind);
  const session = readSession(opts.session);

  const target = findMergeTarget({ project, paths, testable }, testedEntryIds(readResults()));
  if (target) {
    const merged: Entry = {
      ...target,
      kind: parsed.kind!,
      level,
      skill: String(parsed.skill),
      paths: [...new Set([...target.paths, ...paths])],
      testable,
      commit: commit || target.commit,
      body: parsed.body ?? target.body,
    };
    writeEntry(merged);
    if (!session.entries.includes(merged.id)) writeSession(opts.session, { ...session, entries: [...session.entries, merged.id] });
    return { action: "updated", entry: merged };
  }

  const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : today(now);
  const entry: Entry = {
    id: uniqueId(date, testable),
    date,
    session: opts.session,
    project,
    commit,
    kind: parsed.kind!,
    level,
    skill: String(parsed.skill),
    paths,
    testable,
    suppressed: false,
    body: parsed.body ?? "",
  };
  writeEntry(entry);
  writeSession(opts.session, { ...session, entries: [...session.entries, entry.id] });
  return { action: "logged", entry };
}

/** Validate and store an entry from markdown. There is no per-session cap; near-duplicates are merged. */
export function addEntry(markdown: string, opts: AddOpts): CmdResult {
  const parsed = parseEntry(markdown);
  const errors = validateEntry(parsed);
  if (errors.length) return fail(`entry rejected:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  const { action, entry } = storeEntry(parsed, opts);
  return ok(
    action === "updated"
      ? `updated ${entry.id} (merged with a similar untested entry) [${entry.level}]`
      : `logged ${entry.id} [${entry.level}]`,
  );
}

export function listCmd(session?: string): CmdResult {
  let entries = listEntries();
  if (session) {
    const ids = new Set(readSession(session).entries);
    entries = entries.filter((e) => ids.has(e.id));
  }
  return ok(entries.length ? entries.map(summarize).join("\n") : "no entries");
}

export const QUIZ_SIZE = 10;

/** Split QUIZ_SIZE into design/detail counts from the candidates' effective focus (per project). */
export function targetSplit(entries: Entry[], config = readConfig()): { design: number; detail: number } {
  if (!entries.length) {
    const design = Math.round(QUIZ_SIZE * designShare(effectiveFocus(config)));
    return { design, detail: QUIZ_SIZE - design };
  }
  const share = entries.reduce((sum, e) => sum + designShare(effectiveFocus(config, e.project)), 0) / entries.length;
  const design = Math.round(QUIZ_SIZE * share);
  return { design, detail: QUIZ_SIZE - design };
}

/** Everything the skill needs to build this week's quiz, as JSON. */
export function quizInput(now = new Date()): CmdResult {
  const config = readConfig();
  const results = readResults();
  const tested = testedEntryIds(results);
  const queue = readQueue();
  const due = dueItems(queue, now);
  const dueIds = new Set(due.map((d) => d.entry_id));
  const entries = listEntries().filter((e) => !e.suppressed);
  const cutoff = staleBefore(now);
  const withFocus = (e: Entry) => ({ ...e, focus: effectiveFocus(config, e.project).mode });

  const retests = entries
    .filter((e) => dueIds.has(e.id))
    .map((e) => ({ ...withFocus(e), retest: { streak: queue[e.id].streak, due: queue[e.id].due[0] } }));
  const untested = entries.filter((e) => !tested.has(e.id) && !queue[e.id]);
  // Untested for 3+ weeks: out of the quiz pool (still visible in notes), so a heavy week can't create an endless backlog.
  const fresh = untested.filter((e) => e.date >= cutoff);

  return ok(
    JSON.stringify(
      {
        now: now.toISOString(),
        config: { rating: config.rating, keep_sharp: config.keep_sharp, last_test_at: config.last_test_at },
        target_questions: QUIZ_SIZE,
        target_split: targetSplit([...retests, ...fresh], config),
        stale_count: untested.length - fresh.length,
        retests,
        fresh: fresh.map(withFocus),
      },
      null,
      2,
    ),
  );
}

export function recordCmd(entryId: string, grade: string, type: string, now = new Date()): CmdResult {
  if (!["got", "partial", "missed"].includes(grade)) return fail("grade must be got | partial | missed");
  if (!QUESTION_TYPES.includes(type as QuestionType)) return fail(`type must be one of ${QUESTION_TYPES.join(" | ")}`);
  const entry = readEntry(entryId);
  if (!entry) return fail(`no entry ${entryId}`);

  const queue = readQueue();
  const isRetest = Boolean(queue[entryId]);
  appendResult({
    ts: now.toISOString(),
    entry_id: entryId,
    project: entry.project,
    skill: entry.skill,
    level: entry.level,
    question_type: type as QuestionType,
    grade: grade as Grade,
    is_retest: isRetest,
  });
  const next = applyGrade(queue, entryId, grade as Grade, now);
  writeQueue(next);

  let status: string;
  if (next[entryId]) status = `queued, next retest ${next[entryId].due[0].slice(0, 10)} (streak ${next[entryId].streak}/2)`;
  else if (isRetest) status = "retired after two consecutive passes";
  else status = "passed, not queued";
  return ok(`recorded ${grade} for ${entryId}: ${status}`);
}

export function suppressCmd(entryId: string): CmdResult {
  const entry = readEntry(entryId);
  if (!entry) return fail(`no entry ${entryId}`);
  writeEntry({ ...entry, suppressed: true });
  const queue = readQueue();
  if (queue[entryId]) {
    delete queue[entryId];
    writeQueue(queue);
  }
  return ok(`suppressed ${entryId}; it will not appear in future tests`);
}

export function finishTest(now = new Date()): CmdResult {
  const config = readConfig();
  writeConfig({ ...config, last_test_at: now.toISOString() });
  const backlog = Object.keys(readQueue()).length;
  return ok(`test finished at ${now.toISOString()}; retest backlog: ${backlog}`);
}

export function statsCmd(project?: string): CmdResult {
  return ok(
    renderStats({
      entries: listEntries(),
      results: readResults(),
      queue: readQueue(),
      rating: readConfig().rating,
      project,
    }),
  );
}

export interface NotesOpts {
  all?: boolean;
  project?: string;
  text?: boolean;
}

/** Write the notes page and open it in the browser; `text` prints the plain-text list instead. */
export function notesCmd(opts: NotesOpts = {}, now = new Date()): CmdResult {
  if (!opts.text) {
    const file = paths.notesHtml();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderNotesHtml({ ...buildNotesData(now), initial: { all: !!opts.all, project: opts.project ?? null } }));
    return ok(openInBrowser(file) ? `opened ${file}` : `notes page written: file://${file}`);
  }
  return ok(
    renderNotes({
      entries: listEntries(),
      tested: testedEntryIds(readResults()),
      queue: readQueue(),
      now,
      all: opts.all,
      project: opts.project,
    }),
  );
}

export interface FocusOpts {
  mode?: string;
  balance?: string;
  project?: boolean;
  reset?: boolean;
  cwd: string;
}

/** Parse `focus` CLI args: [mode] [--balance x] [--project] [--reset]. Shared by `selflore` and `sl`. */
export function focusArgs(args: string[], cwd = process.cwd()): FocusOpts {
  const i = args.indexOf("--balance");
  const mode = args.find((a, j) => !a.startsWith("--") && (i < 0 || j !== i + 1));
  return {
    mode,
    balance: i >= 0 ? args[i + 1] : undefined,
    project: args.includes("--project"),
    reset: args.includes("--reset"),
    cwd,
  };
}

/** Show or change the capture focus, globally or for the current project (which then takes priority). */
export function focusCmd(opts: FocusOpts): CmdResult {
  if (!configExists()) return fail("selflore is not set up yet; run `npx selflore init` first");
  const config = readConfig();
  const project = projectInfo(opts.cwd).project;

  if (opts.mode && !FOCUS_MODES.includes(opts.mode as FocusMode))
    return fail(`focus must be one of ${FOCUS_MODES.join(" | ")}`);
  if (opts.balance && !BALANCES.includes(opts.balance as Balance))
    return fail(`--balance must be one of ${BALANCES.join(" | ")}`);

  if (opts.reset) {
    if (!opts.project) return fail("--reset only applies with --project (it removes this project's override)");
    const { [project]: _removed, ...rest } = config.projects;
    writeConfig({ ...config, projects: rest });
  } else if (opts.mode || opts.balance) {
    const change = {
      ...(opts.mode ? { mode: opts.mode as FocusMode } : {}),
      ...(opts.balance ? { balance: opts.balance as Balance } : {}),
    };
    if (opts.project) writeConfig({ ...config, projects: { ...config.projects, [project]: { ...config.projects[project], ...change } } });
    else writeConfig({ ...config, focus: { ...config.focus, ...change } });
  }

  const next = readConfig();
  const eff = effectiveFocus(next, project);
  return ok(
    [
      `global focus:  ${describeFocus(next.focus)}`,
      `${project}:  ${describeFocus(eff)} (${eff.source === "project" ? "project override" : "from global"})`,
    ].join("\n"),
  );
}
