import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/config.js";
import { sessionStartContext, testOverdue } from "../src/lib/nudge.js";
import { anyTrigger, detectTriggers } from "../src/lib/transcript.js";

let n = 0;
const toolUse = (name: string, input: Record<string, unknown>) => {
  const id = `tu_${++n}`;
  return { id, line: JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } }) };
};
const toolResult = (id: string, content: string, is_error = false) =>
  JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content, is_error }] } });
const userText = (text: string) => JSON.stringify({ type: "user", message: { content: text } });

describe("transcript triggers", () => {
  it("ignores trivial sessions", () => {
    const small = toolUse("Edit", { file_path: "/r/a.ts", old_string: "a", new_string: "b" });
    const t = detectTriggers([userText("rename a to b"), small.line, "not json"].join("\n"));
    expect(anyTrigger(t)).toBe(false);
  });

  it("detects a 30+ line write", () => {
    const w = toolUse("Write", { file_path: "/r/src/big.ts", content: "x\n".repeat(40) });
    expect(detectTriggers(w.line).largeWrites).toEqual(["/r/src/big.ts"]);
  });

  it("ignores writes inside ~/.selflore", () => {
    const w = toolUse("Write", { file_path: "/home/u/.selflore/entries/x.md", content: "x\n".repeat(40) });
    expect(anyTrigger(detectTriggers(w.line))).toBe(false);
  });

  it("detects dependency changes", () => {
    const e = toolUse("Edit", { file_path: "/r/package.json", old_string: "{", new_string: '{"zod": "1"' });
    expect(detectTriggers(e.line).depChanges).toHaveLength(1);
    const b = toolUse("Bash", { command: "npm install zod" });
    expect(detectTriggers(b.line).depChanges).toHaveLength(1);
  });

  it("detects a fail → edit → pass loop but not pass → edit → pass", () => {
    const t1 = toolUse("Bash", { command: "npm test" });
    const fix = toolUse("Edit", { file_path: "/r/a.ts", old_string: "a", new_string: "b" });
    const t2 = toolUse("Bash", { command: "npm test" });
    const loop = [t1.line, toolResult(t1.id, "1 FAILED", true), fix.line, t2.line, toolResult(t2.id, "all passed")];
    expect(detectTriggers(loop.join("\n")).bugFixLoop).toBe(true);

    const noFail = [t1.line, toolResult(t1.id, "ok"), fix.line, t2.line, toolResult(t2.id, "ok")];
    expect(detectTriggers(noFail.join("\n")).bugFixLoop).toBe(false);
  });
});

describe("session start nudge", () => {
  const now = new Date("2026-10-10T00:00:00Z");

  it("is overdue only with entries and a week since the last test (or first entry)", () => {
    expect(testOverdue(DEFAULT_CONFIG, null, now)).toBe(false);
    expect(testOverdue(DEFAULT_CONFIG, "2026-10-08", now)).toBe(false);
    expect(testOverdue(DEFAULT_CONFIG, "2026-10-01", now)).toBe(true);
    expect(testOverdue({ ...DEFAULT_CONFIG, last_test_at: "2026-10-05T00:00:00Z" }, "2026-09-01", now)).toBe(false);
    expect(testOverdue({ ...DEFAULT_CONFIG, last_test_at: "2026-10-01T00:00:00Z" }, "2026-09-01", now)).toBe(true);
  });

  it("always injects the session id, adds the nudge only when enabled", () => {
    expect(sessionStartContext("abc", DEFAULT_CONFIG, "2026-10-01", now)).toMatch(/session_id=abc\nselflore: weekly test overdue/);
    expect(sessionStartContext("abc", { ...DEFAULT_CONFIG, nudge: false }, "2026-10-01", now)).toBe("selflore session_id=abc");
  });
});
