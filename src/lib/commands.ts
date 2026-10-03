import { execFileSync } from "node:child_process";
import path from "node:path";
import { readConfig, writeConfig } from "./config.js";
import {
  deleteEntry,
  listEntries,
  parseEntry,
  readEntry,
  uniqueId,
  validateEntry,
  writeEntry,
  type Entry,
} from "./entries.js";
import { applyGrade, dueItems, readQueue, writeQueue, type Grade } from "./queue.js";
import { appendResult, QUESTION_TYPES, readResults, testedEntryIds, type QuestionType } from "./results.js";
import { readSession, writeSession } from "./session.js";
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

export function projectInfo(cwd: string): { project: string; commit: string } {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  return {
    project: path.basename(top || cwd),
    commit: top ? git(cwd, ["rev-parse", "--short", "HEAD"]) : "",
  };
}

function today(now: Date): string {
  // Local calendar date: an entry logged at 1am belongs to the user's today, not UTC's.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function summarize(e: Entry): string {
  return `- ${e.id} [${e.kind}/${e.skill}] ${e.testable}`;
}

export interface AddOpts {
  session: string;
  cwd: string;
  manual?: boolean;
  replace?: string;
  now?: Date;
}

/** Validate, enrich and store an entry. Enforces max_entries_per_session (manual logs warn instead). */
export function addEntry(markdown: string, opts: AddOpts): CmdResult {
  const now = opts.now ?? new Date();
  const parsed = parseEntry(markdown);
  const errors = validateEntry(parsed);
  if (errors.length) return fail(`entry rejected:\n${errors.map((e) => `  - ${e}`).join("\n")}`);

  const config = readConfig();
  const session = readSession(opts.session);
  const sessionEntries = session.entries.filter((id) => readEntry(id) !== null);
  let warning = "";

  if (opts.replace) {
    if (!sessionEntries.includes(opts.replace))
      return fail(`cannot replace ${opts.replace}: it was not logged in this session`);
    if (testedEntryIds(readResults()).has(opts.replace))
      return fail(`cannot replace ${opts.replace}: it has already been tested`);
    deleteEntry(opts.replace);
    sessionEntries.splice(sessionEntries.indexOf(opts.replace), 1);
  } else if (sessionEntries.length >= config.max_entries_per_session) {
    if (!opts.manual) {
      const current = sessionEntries.map((id) => readEntry(id)).filter((e): e is Entry => e !== null);
      return fail(
        [
          `cap reached: ${sessionEntries.length}/${config.max_entries_per_session} entries this session.`,
          `Keep the ones that best match keep_sharp (${config.keep_sharp.join(", ")}).`,
          `If the new one is better, rerun with \`entry replace <id>\`; otherwise drop it.`,
          ...current.map(summarize),
        ].join("\n"),
        2,
      );
    }
    warning = `\nnote: over the session cap (${config.max_entries_per_session}); logged anyway because it was manual.`;
  }

  const { project, commit } = projectInfo(opts.cwd);
  const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : today(now);
  const entry: Entry = {
    id: uniqueId(date, String(parsed.testable)),
    date,
    session: opts.session,
    project: parsed.project ? String(parsed.project) : project,
    commit: parsed.commit ? String(parsed.commit) : commit,
    kind: parsed.kind!,
    skill: String(parsed.skill),
    paths: Array.isArray(parsed.paths) ? parsed.paths.map(String) : [],
    testable: String(parsed.testable),
    suppressed: false,
    body: parsed.body ?? "",
  };
  writeEntry(entry);
  writeSession(opts.session, { ...session, entries: [...sessionEntries, entry.id] });
  const count = sessionEntries.length + 1;
  return ok(`logged ${entry.id} (${count}/${config.max_entries_per_session} this session)${warning}`);
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

/** Everything the skill needs to build this week's quiz, as JSON. */
export function quizInput(now = new Date()): CmdResult {
  const config = readConfig();
  const results = readResults();
  const tested = testedEntryIds(results);
  const queue = readQueue();
  const due = dueItems(queue, now);
  const dueIds = new Set(due.map((d) => d.entry_id));
  const entries = listEntries().filter((e) => !e.suppressed);

  const retests = entries
    .filter((e) => dueIds.has(e.id))
    .map((e) => ({ ...e, retest: { streak: queue[e.id].streak, due: queue[e.id].due[0] } }));
  const fresh = entries.filter((e) => !tested.has(e.id) && !queue[e.id]);

  return ok(
    JSON.stringify(
      {
        now: now.toISOString(),
        config: { rating: config.rating, keep_sharp: config.keep_sharp, last_test_at: config.last_test_at },
        target_questions: QUIZ_SIZE,
        retests,
        fresh,
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
