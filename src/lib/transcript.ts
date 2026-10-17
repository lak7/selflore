import fs from "node:fs";
import path from "node:path";
import type { Intensity } from "./config.js";

/**
 * Cheap heuristics over a Claude Code transcript (JSONL) that decide whether a stretch
 * of work is worth a capture pass. Only mechanically observable triggers live here;
 * tradeoffs and corrections are judged by the capture model itself.
 */

export const MIN_LINES: Record<Intensity, number> = { light: 80, normal: 30, thorough: 15 };

const DEP_FILES = new Set([
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
  "build.gradle",
  "build.gradle.kts",
  "pom.xml",
]);

// Reports, notes and data the agent wrote for the user to read, not code to understand later.
const DOC_EXTS = new Set([".md", ".mdx", ".markdown", ".txt", ".rst", ".csv", ".tsv", ".log", ".json", ".html", ".pdf"]);

const TEST_CMD = /\b(test|tests|jest|vitest|pytest|mocha|rspec|cargo test|go test|phpunit|tsc)\b/;
const FAIL_TEXT = /\b(FAIL|FAILED|failed|Error:|error TS\d+|Traceback|panic:)\b/;

export interface Triggers {
  largeWrites: string[]; // file paths
  depChanges: string[];
  bugFixLoop: boolean;
}

export interface WriteInfo {
  file: string;
  editCount: number; // how many Write/Edit calls touched it in the scanned range
}

export interface DetectOpts {
  minLines?: number;
  /** Return false to ignore a large write (docs, throwaway scripts…). Called once per file. */
  keepWrite?: (w: WriteInfo) => boolean;
}

interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function lineCount(s: unknown): number {
  return typeof s === "string" && s.length ? s.split("\n").length : 0;
}

function contentText(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === "string" ? p : (p as { text?: string })?.text ?? "")).join("\n");
  return "";
}

/** Files never worth capturing from, regardless of size. */
export function isIgnoredPath(file: string): boolean {
  const norm = file.split(path.sep).join("/");
  if (norm.includes("/.claude/") || norm.includes("/.selflore/")) return true;
  const base = path.basename(file);
  if (DEP_FILES.has(base)) return false;
  return DOC_EXTS.has(path.extname(base).toLowerCase());
}

export function detectTriggers(jsonl: string, opts: DetectOpts = {}): Triggers {
  const minLines = opts.minLines ?? MIN_LINES.normal;
  const added = new Map<string, number>(); // largest single write per file
  const edits = new Map<string, number>();
  const depChanges = new Set<string>();
  const testCmds = new Map<string, boolean>(); // tool_use id -> is a test command
  const seq: ("fail" | "pass" | "edit")[] = [];

  for (const raw of jsonl.split("\n")) {
    if (!raw.trim()) continue;
    let line: { type?: string; message?: { content?: unknown } };
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    const content = line.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content as Record<string, unknown>[]) {
      if (block.type === "tool_use") {
        const tu = block as unknown as ToolUse;
        const input = tu.input ?? {};
        const file = typeof input.file_path === "string" ? input.file_path : "";

        if (["Write", "Edit", "MultiEdit"].includes(tu.name)) {
          if (!file || isIgnoredPath(file)) continue;
          let n = 0;
          if (tu.name === "Write") n = lineCount(input.content);
          else if (tu.name === "Edit") n = lineCount(input.new_string) - lineCount(input.old_string);
          else if (Array.isArray(input.edits))
            n = (input.edits as Record<string, unknown>[]).reduce(
              (sum, e) => sum + lineCount(e.new_string) - lineCount(e.old_string),
              0,
            );
          added.set(file, Math.max(added.get(file) ?? 0, n));
          edits.set(file, (edits.get(file) ?? 0) + 1);
          if (DEP_FILES.has(path.basename(file))) depChanges.add(file);
          seq.push("edit");
        } else if (tu.name === "Bash" && typeof input.command === "string") {
          testCmds.set(tu.id, TEST_CMD.test(input.command));
          if (/\b(npm|pnpm|yarn|bun) (add|install|i) \S|\bpip install \S|\bcargo add\b|\bgo get\b/.test(input.command))
            depChanges.add(input.command.slice(0, 80));
        }
      } else if (block.type === "tool_result") {
        const id = String(block.tool_use_id ?? "");
        if (!testCmds.get(id)) continue;
        const failed = block.is_error === true || FAIL_TEXT.test(contentText(block.content));
        seq.push(failed ? "fail" : "pass");
      }
    }
  }

  const largeWrites = [...added]
    .filter(([file, n]) => n >= minLines && (opts.keepWrite?.({ file, editCount: edits.get(file) ?? 1 }) ?? true))
    .map(([file]) => file);

  // fail → (edit)+ → pass
  let bugFixLoop = false;
  let state: "idle" | "failed" | "edited" = "idle";
  for (const ev of seq) {
    if (ev === "fail") state = "failed";
    else if (ev === "edit" && state !== "idle") state = "edited";
    else if (ev === "pass" && state === "edited") {
      bugFixLoop = true;
      break;
    } else if (ev === "pass") state = "idle";
  }

  return { largeWrites, depChanges: [...depChanges], bugFixLoop };
}

export function anyTrigger(t: Triggers): boolean {
  return t.largeWrites.length > 0 || t.depChanges.length > 0 || t.bugFixLoop;
}

export function describeTriggers(t: Triggers): string {
  const parts: string[] = [];
  if (t.largeWrites.length) parts.push(`changes to ${t.largeWrites.map((f) => path.basename(f)).join(", ")}`);
  if (t.depChanges.length) parts.push("new dependencies");
  if (t.bugFixLoop) parts.push("a fail → fix → pass loop");
  return parts.join("; ");
}

/**
 * Read the transcript from a byte offset (optionally up to `to`), ending at the last complete line.
 * Returns the text plus the actual start and the offset to resume from. A shrunk file restarts at 0.
 */
export function readTranscriptFrom(file: string | undefined, from: number, to?: number): { text: string; start: number; end: number } {
  if (!file) return { text: "", start: from, end: from };
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return { text: "", start: from, end: from };
  }
  const start = from > size ? 0 : from;
  const stop = to !== undefined && to > start ? Math.min(to, size) : size;
  if (stop <= start) return { text: "", start, end: start };
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(stop - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const lastNl = buf.lastIndexOf(0x0a);
    if (lastNl < 0) return { text: "", start, end: start };
    return { text: buf.subarray(0, lastNl + 1).toString("utf8"), start, end: start + lastNl + 1 };
  } finally {
    fs.closeSync(fd);
  }
}

/** Model id of the most recent assistant message in a transcript chunk, if any. */
export function lastModel(jsonl: string): string | null {
  let model: string | null = null;
  for (const raw of jsonl.split("\n")) {
    if (!raw.includes('"model"')) continue;
    try {
      const line = JSON.parse(raw) as { type?: string; message?: { model?: string } };
      if (line.type === "assistant" && typeof line.message?.model === "string" && !line.message.model.startsWith("<"))
        model = line.message.model;
    } catch {
      // ignore
    }
  }
  return model;
}

const MAX_BLOCK_LINES = 60;

function clip(s: string, maxLines = MAX_BLOCK_LINES): string {
  const lines = s.split("\n");
  return lines.length <= maxLines ? s : `${lines.slice(0, maxLines).join("\n")}\n… (${lines.length - maxLines} more lines)`;
}

/**
 * A compact, readable excerpt of a transcript chunk for the capture model:
 * user prompts, assistant prose, and tool calls with paths and (clipped) code.
 * Keeps the most recent `maxChars` if the chunk is long.
 */
export function buildExcerpt(jsonl: string, maxChars = 60_000): string {
  const out: string[] = [];
  const bashIds = new Set<string>();
  for (const raw of jsonl.split("\n")) {
    if (!raw.trim()) continue;
    let line: { type?: string; isMeta?: boolean; message?: { role?: string; content?: unknown } };
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    if (line.isMeta) continue;
    const content = line.message?.content;
    if (line.type === "user") {
      if (typeof content === "string") {
        if (!content.startsWith("<")) out.push(`USER: ${clip(content, 40)}`);
        continue;
      }
      if (!Array.isArray(content)) continue;
      for (const b of content as Record<string, unknown>[]) {
        if (b.type === "text" && typeof b.text === "string" && !b.text.startsWith("<")) out.push(`USER: ${clip(b.text, 40)}`);
        else if (b.type === "tool_result" && bashIds.has(String(b.tool_use_id))) {
          const text = contentText(b.content);
          if (b.is_error === true || FAIL_TEXT.test(text)) out.push(`RESULT (failed): ${clip(text, 20)}`);
        }
      }
    } else if (line.type === "assistant" && Array.isArray(content)) {
      for (const b of content as Record<string, unknown>[]) {
        if (b.type === "text" && typeof b.text === "string" && b.text.trim()) out.push(`ASSISTANT: ${clip(b.text, 40)}`);
        else if (b.type === "tool_use") {
          const input = (b.input ?? {}) as Record<string, unknown>;
          const file = typeof input.file_path === "string" ? input.file_path : "";
          if (b.name === "Write" && file && !isIgnoredPath(file)) out.push(`WRITE ${file}:\n${clip(String(input.content ?? ""))}`);
          else if (b.name === "Edit" && file && !isIgnoredPath(file))
            out.push(`EDIT ${file}:\n- ${clip(String(input.old_string ?? ""), 20)}\n+ ${clip(String(input.new_string ?? ""))}`);
          else if (b.name === "MultiEdit" && file && !isIgnoredPath(file) && Array.isArray(input.edits))
            out.push(`EDIT ${file}:\n${(input.edits as Record<string, unknown>[]).map((e) => `+ ${clip(String(e.new_string ?? ""), 30)}`).join("\n")}`);
          else if (b.name === "Bash" && typeof input.command === "string") {
            bashIds.add(String(b.id));
            out.push(`RUN: ${clip(input.command, 5)}`);
          }
        }
      }
    }
  }
  const text = out.join("\n\n");
  return text.length <= maxChars ? text : `… (earlier work omitted)\n\n${text.slice(text.length - maxChars)}`;
}
