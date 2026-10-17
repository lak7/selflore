import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureModel, keepWriteFor, parseCaptureReply, runCapture, toDraft, type WorkerArgs } from "../src/lib/background.js";
import { addEntry, focusArgs, focusCmd, quizInput, targetSplit } from "../src/lib/commands.js";
import { DEFAULT_CONFIG, effectiveFocus, migrateConfig, readConfig, writeConfig, type Config } from "../src/lib/config.js";
import { listEntries, type Entry } from "../src/lib/entries.js";
import { handlePromptSubmit, handleSessionStart, handleStop } from "../src/lib/hook-logic.js";
import { removeFiles } from "../src/lib/install.js";
import { addAnnounce, readSession, updateSession } from "../src/lib/session.js";
import { buildExcerpt, detectTriggers, isIgnoredPath, lastModel, MIN_LINES, readTranscriptFrom } from "../src/lib/transcript.js";
import { sample, useTempHomes } from "./helpers.js";

const cwd = process.cwd();
const project = path.basename(path.dirname(cwd)) + "/" + path.basename(cwd);

let n = 0;
const write = (file: string, lines: number) =>
  JSON.stringify({
    type: "assistant",
    message: { model: "claude-opus-5-5", content: [{ type: "tool_use", id: `t${++n}`, name: "Write", input: { file_path: file, content: "x\n".repeat(lines) } }] },
  });
const userSays = (text: string) => JSON.stringify({ type: "user", message: { content: text } });

describe("config", () => {
  it("migrates the old per-session cap to an intensity and fills new fields", () => {
    expect(migrateConfig({ rating: 7, max_entries_per_session: 3 }).capture_intensity).toBe("light");
    expect(migrateConfig({ max_entries_per_session: 5 }).capture_intensity).toBe("normal");
    const c = migrateConfig({ max_entries_per_session: 7, rating: 7 });
    expect(c.capture_intensity).toBe("thorough");
    expect(c.rating).toBe(7);
    expect("max_entries_per_session" in c).toBe(false);
    expect(c.focus).toEqual({ mode: "mixed", balance: "balanced" });
    expect(c.capture).toBe("background");
    expect(c.capture_model).toBe("session");
    expect(migrateConfig({ capture: "nonsense", focus: { mode: "nope" } })).toMatchObject({ capture: "background", focus: { mode: "mixed" } });
  });

  it("project focus overrides the global focus, field by field", () => {
    const c: Config = { ...DEFAULT_CONFIG, focus: { mode: "design", balance: "balanced" }, projects: { "me/learn-rust": { mode: "details" }, "me/app": { balance: "design" } } };
    expect(effectiveFocus(c)).toMatchObject({ mode: "design", source: "global" });
    expect(effectiveFocus(c, "me/learn-rust")).toMatchObject({ mode: "details", source: "project" });
    expect(effectiveFocus(c, "me/app")).toMatchObject({ mode: "design", balance: "design", source: "project" });
    expect(effectiveFocus(c, "me/other")).toMatchObject({ mode: "design", source: "global" });
  });
});

describe("focus command and quiz", () => {
  useTempHomes();

  it("sets global and per-project focus, and resets the project override", () => {
    writeConfig(DEFAULT_CONFIG);
    expect(focusCmd(focusArgs(["design"], cwd)).out).toMatch(/global focus: {2}design/);
    expect(focusCmd(focusArgs(["details", "--project"], cwd)).out).toMatch(/details \(project override\)/);
    expect(readConfig().projects[project]).toEqual({ mode: "details" });
    expect(focusCmd(focusArgs(["mixed", "--balance", "design", "--project"], cwd)).out).toMatch(/mixed \(mostly design\) \(project override\)/);
    expect(focusCmd(focusArgs(["--reset", "--project"], cwd)).out).toMatch(/design \(from global\)/);
    expect(focusCmd(focusArgs(["sideways"], cwd)).code).toBe(1);
    expect(focusCmd(focusArgs(["mixed", "--balance", "lots"], cwd)).code).toBe(1);
  });

  it("splits quiz questions by the entries' effective focus", () => {
    const e = (p: string) => ({ project: p }) as Entry;
    const c: Config = { ...DEFAULT_CONFIG, focus: { mode: "mixed", balance: "design" }, projects: { "a/details": { mode: "details" } } };
    expect(targetSplit([], c)).toEqual({ design: 7, detail: 3 });
    expect(targetSplit([e("x/y"), e("x/y")], c)).toEqual({ design: 7, detail: 3 });
    expect(targetSplit([e("a/details")], c)).toEqual({ design: 0, detail: 10 });
    expect(targetSplit([e("a/details"), e("x/y")], c)).toEqual({ design: 4, detail: 6 });
  });

  it("leaves entries untested for 3+ weeks out of the quiz pool", () => {
    writeConfig(DEFAULT_CONFIG);
    addEntry(sample("Old lore about retries?").replace("---\nkind", "---\ndate: 2026-09-01\nkind"), { session: "s", cwd });
    addEntry(sample("New lore about caching?").replace("---\nkind", "---\ndate: 2026-10-05\nkind"), { session: "s", cwd });
    const quiz = JSON.parse(quizInput(new Date("2026-10-09T12:00:00Z")).out);
    expect(quiz.fresh.map((x: Entry) => x.testable)).toEqual(["New lore about caching?"]);
    expect(quiz.stale_count).toBe(1);
    expect(quiz.target_split).toEqual({ design: 5, detail: 5 });
  });
});

describe("triggers", () => {
  it("ignores docs, reports and ~/.claude, but not dependency manifests", () => {
    expect(isIgnoredPath("/r/ElevenLabs_Credit_Usage_Report.md")).toBe(true);
    expect(isIgnoredPath("/r/out/data.csv")).toBe(true);
    expect(isIgnoredPath("/Users/u/.claude/plans/x.ts")).toBe(true);
    expect(isIgnoredPath("/r/package.json")).toBe(false);
    expect(isIgnoredPath("/r/src/run.py")).toBe(false);
    const t = detectTriggers([write("/r/Report.md", 200), write("/r/notes.txt", 90)].join("\n"));
    expect(t.largeWrites).toEqual([]);
  });

  it("uses the intensity's line threshold", () => {
    const jsonl = write("/r/src/a.ts", 40);
    expect(detectTriggers(jsonl, { minLines: MIN_LINES.light }).largeWrites).toEqual([]);
    expect(detectTriggers(jsonl, { minLines: MIN_LINES.normal }).largeWrites).toEqual(["/r/src/a.ts"]);
  });

  it("drops one-off untracked scripts in the repo root and files outside the project", () => {
    const keep = keepWriteFor(cwd, (_root, rel) => rel.startsWith("src/"));
    expect(keep({ file: path.join(cwd, "run.py"), editCount: 1 })).toBe(false); // untracked, root, written once
    expect(keep({ file: path.join(cwd, "run.py"), editCount: 3 })).toBe(true); // iterated on: real work
    expect(keep({ file: path.join(cwd, "src/lib/new.ts"), editCount: 1 })).toBe(true);
    expect(keep({ file: "/tmp/elsewhere/x.ts", editCount: 5 })).toBe(false);
  });

  it("reads only the transcript since an offset, ending on a full line", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-tx-"));
    const file = path.join(dir, "t.jsonl");
    const first = userSays("first") + "\n";
    fs.writeFileSync(file, first + userSays("second") + "\n" + '{"partial":');
    const a = readTranscriptFrom(file, 0);
    expect(a.text).toContain("first");
    expect(a.text).not.toContain("partial");
    const b = readTranscriptFrom(file, Buffer.byteLength(first));
    expect(b.text).not.toContain("first");
    expect(b.text).toContain("second");
    expect(readTranscriptFrom(file, 10_000).start).toBe(0); // file shrank: restart
    fs.rmSync(dir, { recursive: true });
  });

  it("builds a compact excerpt and finds the session model", () => {
    const jsonl = [userSays("add a rate limiter"), write("/r/src/limiter.ts", 3), write("/r/REPORT.md", 3)].join("\n");
    const ex = buildExcerpt(jsonl);
    expect(ex).toContain("USER: add a rate limiter");
    expect(ex).toContain("WRITE /r/src/limiter.ts");
    expect(ex).not.toContain("REPORT.md");
    expect(lastModel(jsonl)).toBe("claude-opus-5-5");
  });
});

describe("hooks never block", () => {
  const homes = useTempHomes();
  const transcript = () => path.join(homes.sl(), "t.jsonl");
  const input = () => ({ session_id: "s1", transcript_path: transcript(), cwd });

  function setup(config: Partial<Config> = {}) {
    writeConfig({ ...DEFAULT_CONFIG, ...config });
    fs.mkdirSync(homes.sl(), { recursive: true });
    fs.writeFileSync(transcript(), userSays("hi") + "\n");
  }
  const append = (line: string) => fs.appendFileSync(transcript(), line + "\n");
  const keepAll = () => true;

  it("background: spawns a worker for new work only, holds a lock, and never prints a block", () => {
    setup();
    const spawned: WorkerArgs[] = [];
    const deps = { spawn: (a: WorkerArgs) => (spawned.push(a), true), keepWrite: keepAll };

    expect(handleStop(input(), deps)).toBe("none");
    append(write("/r/src/a.ts", 50));
    expect(handleStop(input(), deps)).toBe("spawned");
    expect(spawned[0]).toMatchObject({ session: "s1", from: 0 });
    expect(handleStop(input(), deps)).toBe("locked");

    updateSession("s1", { capturing_since: null }); // worker finished
    expect(handleStop(input(), deps)).toBe("none"); // nothing new since
    append(write("/r/src/b.ts", 50));
    expect(handleStop(input(), deps)).toBe("spawned");
    expect(spawned[1].from).toBe(spawned[0].to); // only the new range
  });

  it("quiet: leaves a hint that the next prompt delivers exactly once", () => {
    setup({ capture: "quiet" });
    append(write("/r/src/a.ts", 50));
    expect(handleStop(input(), { keepWrite: keepAll, spawn: () => true })).toBe("pending");
    expect(handlePromptSubmit(input())).toMatch(/^selflore: recent work had changes to a\.ts\. At a natural pause/);
    expect(handlePromptSubmit(input())).toBe("");
  });

  it("off: does nothing", () => {
    setup({ capture: "off" });
    append(write("/r/src/a.ts", 50));
    expect(handleStop(input(), { keepWrite: keepAll, spawn: () => true })).toBe("off");
  });

  it("the built hook scripts never output a block decision and do nothing under SELFLORE_BG", () => {
    setup({ capture: "quiet" });
    append(write(path.join(cwd, "src/real.ts"), 50));
    const run = (script: string, env: Record<string, string> = {}) =>
      execFileSync(process.execPath, [path.join(cwd, "dist/hooks", script)], {
        input: JSON.stringify(input()),
        env: { ...process.env, SELFLORE_HOME: homes.sl(), CLAUDE_HOME: homes.claude(), ...env },
      }).toString();
    expect(run("stop.js", { SELFLORE_BG: "1" })).toBe("");
    expect(readSession("s1").pending).toBeNull();
    const out = run("stop.js");
    expect(out).not.toContain("decision");
    expect(readSession("s1").pending).toMatch(/real\.ts/);
    expect(run("session-start.js", { SELFLORE_BG: "1" })).toBe("");
  });

  it("session start announces background captures once", () => {
    setup();
    addAnnounce(3);
    expect(handleSessionStart({ session_id: "s2" })).toMatch(/captured 3 entries in the background/);
    expect(handleSessionStart({ session_id: "s3" })).not.toMatch(/captured \d/);
  });

  it("remove keeps session state; purge deletes it", () => {
    setup();
    updateSession("s1", { scanned_offset: 42 });
    removeFiles(false);
    expect(readSession("s1").scanned_offset).toBe(42);
    removeFiles(true);
    expect(readSession("s1").scanned_offset).toBe(0);
  });
});

describe("background capture worker", () => {
  useTempHomes();

  const reply = JSON.stringify([
    { kind: "bug", level: "detail", skill: "debugging", paths: ["src/a.ts"], testable: "Why did the cache return stale prices after deploys?", body: "The key omitted the version.", snippet: "key = `${id}:${v}`", snippet_lang: "ts" },
    { kind: "decision", level: "design", skill: "architecture", paths: ["src/q.ts"], testable: "Why a queue instead of cron for refunds?", body: "Cron double-fires across replicas." },
    { kind: "bug", level: "detail", skill: "debugging", paths: [], testable: "", body: "no question → dropped" },
  ]);

  it("stores valid entries from the model reply and respects a single-level focus", () => {
    writeConfig(DEFAULT_CONFIG);
    let prompt = "";
    const stored = runCapture({ session: "s1", cwd, excerpt: "WRITE src/a.ts", sessionModel: null, ask: (sys) => ((prompt = sys), `here you go\n${reply}`) });
    expect(stored).toBe(2);
    expect(prompt).toContain("intensity: normal");
    const entries = listEntries();
    expect(entries.map((e) => e.level).sort()).toEqual(["design", "detail"]);
    expect(entries.find((e) => e.level === "detail")!.body).toContain("```ts\nkey = `${id}:${v}`\n```");

    writeConfig({ ...readConfig(), projects: { [project]: { mode: "design" } } });
    const stored2 = runCapture({ session: "s1", cwd, excerpt: "x", sessionModel: null, ask: () => reply });
    expect(stored2).toBe(1); // only the design entry (merged into the existing one)
  });

  it("parses replies defensively and picks the model", () => {
    expect(parseCaptureReply("no json here")).toEqual([]);
    expect(parseCaptureReply("```json\n[]\n```")).toEqual([]);
    expect(toDraft({ kind: "bug", level: "design", skill: "s", testable: "Why?", body: "b" }, "details")).toBeNull();
    expect(captureModel({ ...DEFAULT_CONFIG, capture_model: "session" }, "claude-opus-5-5")).toBe("claude-opus-5-5");
    expect(captureModel({ ...DEFAULT_CONFIG, capture_model: "haiku" }, "claude-opus-5-5")).toBe("haiku");
  });
});
