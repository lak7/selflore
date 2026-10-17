import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { effectiveFocus, readConfig, type Config } from "./config.js";
import { validateEntry, type Entry, type Kind, type Level } from "./entries.js";
import { capturePrompt } from "./capture-prompt.js";
import { projectInfo, storeEntry } from "./commands.js";
import { paths } from "./paths.js";
import type { WriteInfo } from "./transcript.js";

/** Env flag set on everything selflore spawns, so its own hooks never fire inside a capture. */
export const BG_ENV = "SELFLORE_BG";

function gitRoot(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

function isTracked(root: string, file: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", file], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Filter for large writes: drop files outside the project, and one-off scripts
 * (untracked, sitting in the repo root, written once and never touched again).
 */
export function keepWriteFor(cwd: string, tracked: (root: string, file: string) => boolean = isTracked): (w: WriteInfo) => boolean {
  const root = gitRoot(cwd) || cwd;
  return ({ file, editCount }) => {
    const abs = path.resolve(cwd, file);
    const rel = path.relative(root, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
    const inRoot = !rel.includes(path.sep);
    if (inRoot && editCount <= 1 && !tracked(root, rel)) return false;
    return true;
  };
}

/** Resolve the model flag for the capture call. "session" uses the model the session itself used. */
export function captureModel(config: Config, sessionModel: string | null): string | null {
  if (config.capture_model === "sonnet" || config.capture_model === "haiku") return config.capture_model;
  return sessionModel;
}

export interface WorkerArgs {
  session: string;
  transcript: string;
  from: number;
  to: number;
  cwd: string;
}

export type Spawner = (args: WorkerArgs) => boolean;

/** Start the capture worker fully detached; the Stop hook returns immediately. */
export const spawnWorker: Spawner = (a) => {
  try {
    const worker = path.join(paths.app(), "hooks", "capture-worker.js");
    const child = spawn(process.execPath, [worker, a.session, a.transcript, String(a.from), String(a.to), a.cwd], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, [BG_ENV]: "1" },
    });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
};

/** Pull the JSON array out of the model's reply (tolerates stray prose or code fences). */
export function parseCaptureReply(reply: string): unknown[] {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(reply.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Convert one model-produced object into an entry draft (body = prose + fenced snippet). */
export function toDraft(raw: unknown, focusMode: string): Partial<Entry> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const snippet = typeof r.snippet === "string" && r.snippet.trim() ? r.snippet.replace(/\s+$/, "") : "";
  const lang = typeof r.snippet_lang === "string" ? r.snippet_lang.replace(/[^\w+-]/g, "") : "";
  const draft: Partial<Entry> = {
    kind: r.kind as Kind,
    level: r.level as Level,
    skill: typeof r.skill === "string" ? r.skill : "",
    paths: Array.isArray(r.paths) ? r.paths.filter((p): p is string => typeof p === "string") : [],
    testable: typeof r.testable === "string" ? r.testable.trim() : "",
    body: `${typeof r.body === "string" ? r.body.trim() : ""}${snippet ? `\n\n\`\`\`${lang}\n${snippet}\n\`\`\`` : ""}`,
  };
  if (validateEntry(draft).length) return null;
  // A single-level focus is a hard filter, in case the model drifted.
  if (focusMode === "details" && draft.level !== "detail") return null;
  if (focusMode === "design" && draft.level !== "design") return null;
  return draft;
}

export interface RunCaptureOpts {
  session: string;
  cwd: string;
  excerpt: string;
  sessionModel: string | null;
  now?: Date;
  /** Runs the model; returns its text reply. Injectable for tests. */
  ask?: (systemPrompt: string, input: string, model: string | null) => string;
}

export function askClaude(systemPrompt: string, input: string, model: string | null): string {
  const bin = process.env.SELFLORE_CLAUDE_BIN || "claude";
  const args = ["-p", "--output-format", "json", "--tools", "", "--no-session-persistence", "--system-prompt", systemPrompt];
  if (model) args.push("--model", model);
  // Run from a scratch dir so no project CLAUDE.md is picked up.
  const out = execFileSync(bin, args, {
    input,
    cwd: os.tmpdir(),
    env: { ...process.env, [BG_ENV]: "1" },
    timeout: 5 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "ignore"],
  }).toString();
  try {
    const json = JSON.parse(out) as { result?: string; is_error?: boolean };
    return json.is_error ? "" : (json.result ?? "");
  } catch {
    return out;
  }
}

/** Ask the capture model for entries from an excerpt and store them. Returns how many were stored. */
export function runCapture(opts: RunCaptureOpts): number {
  if (!opts.excerpt.trim()) return 0;
  const config = readConfig();
  const focus = effectiveFocus(config, projectInfo(opts.cwd).project);
  const reply = (opts.ask ?? askClaude)(
    capturePrompt(config, focus),
    `Session excerpt (most recent work):\n\n${opts.excerpt}`,
    captureModel(config, opts.sessionModel),
  );
  let stored = 0;
  for (const raw of parseCaptureReply(reply)) {
    const draft = toDraft(raw, focus.mode);
    if (!draft) continue;
    storeEntry(draft, { session: opts.session, cwd: opts.cwd, now: opts.now });
    stored++;
  }
  return stored;
}

export function logWorkerError(err: unknown): void {
  try {
    fs.mkdirSync(paths.state(), { recursive: true });
    fs.appendFileSync(
      path.join(paths.state(), "capture-errors.log"),
      `${new Date().toISOString()} ${err instanceof Error ? err.message : String(err)}\n`,
    );
  } catch {
    // nothing else we can do
  }
}
