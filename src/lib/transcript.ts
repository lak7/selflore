import fs from "node:fs";
import path from "node:path";

/**
 * Cheap heuristics over a Claude Code transcript (JSONL) for the Stop-hook safety net.
 * Only the mechanically observable PRD triggers are detected here; tradeoffs and
 * corrections are left to the skill itself.
 */

export const LARGE_WRITE_LINES = 30;

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

const TEST_CMD = /\b(test|tests|jest|vitest|pytest|mocha|rspec|cargo test|go test|phpunit|tsc)\b/;
const FAIL_TEXT = /\b(FAIL|FAILED|failed|Error:|error TS\d+|Traceback|panic:)\b/;

export interface Triggers {
  largeWrites: string[]; // file paths
  depChanges: string[];
  bugFixLoop: boolean;
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

export function detectTriggers(jsonl: string): Triggers {
  const largeWrites = new Set<string>();
  const depChanges = new Set<string>();
  const testCmds = new Map<string, boolean>(); // tool_use id -> is a test command
  // Sequence of events: "fail" | "pass" | "edit"
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
        if (file.includes(`${path.sep}.selflore${path.sep}`)) continue;

        let added = 0;
        if (tu.name === "Write") added = lineCount(input.content);
        else if (tu.name === "Edit") added = lineCount(input.new_string) - lineCount(input.old_string);
        else if (tu.name === "MultiEdit" && Array.isArray(input.edits))
          added = (input.edits as Record<string, unknown>[]).reduce(
            (n, e) => n + lineCount(e.new_string) - lineCount(e.old_string),
            0,
          );

        if (["Write", "Edit", "MultiEdit"].includes(tu.name)) {
          if (added >= LARGE_WRITE_LINES) largeWrites.add(file);
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

  return { largeWrites: [...largeWrites], depChanges: [...depChanges], bugFixLoop };
}

export function anyTrigger(t: Triggers): boolean {
  return t.largeWrites.length > 0 || t.depChanges.length > 0 || t.bugFixLoop;
}

export function describeTriggers(t: Triggers): string {
  const parts: string[] = [];
  if (t.largeWrites.length) parts.push(`large writes (${t.largeWrites.map((f) => path.basename(f)).join(", ")})`);
  if (t.depChanges.length) parts.push("new dependencies");
  if (t.bugFixLoop) parts.push("a fail → fix → pass loop");
  return parts.join("; ");
}

export function readTranscript(file: string | undefined): string {
  if (!file) return "";
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
