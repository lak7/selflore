import { describe, expect, it } from "vitest";
import { addEntry, finishTest, projectName, quizInput, recordCmd, statsCmd, suppressCmd } from "../src/lib/commands.js";
import { readConfig, writeConfig, DEFAULT_CONFIG } from "../src/lib/config.js";
import { listEntries } from "../src/lib/entries.js";
import { readQueue } from "../src/lib/queue.js";
import { readResults } from "../src/lib/results.js";
import { sample, useTempHomes } from "./helpers.js";

const cwd = process.cwd();
const now = new Date("2026-10-01T10:00:00Z");

describe("data CLI commands", () => {
  useTempHomes();

  it("adds an entry with project, commit and session filled in", () => {
    const r = addEntry(sample("Why idempotent?"), { session: "s1", cwd, now });
    expect(r.code).toBe(0);
    const [e] = listEntries();
    expect(e.id).toBe("2026-10-01-why-idempotent");
    expect(e.session).toBe("s1");
    expect(e.project).toBe(projectName(cwd));
  });

  it("names projects by parent + directory", () => {
    expect(projectName("/Users/me/GG/selflore/v0")).toBe("selflore/v0");
    expect(projectName("/Users/me/GG/selflore/v0/")).toBe("selflore/v0");
    expect(projectName("/work")).toBe("work");
  });

  it("enforces max_entries_per_session, allows replace and manual overflow", () => {
    writeConfig({ ...DEFAULT_CONFIG, max_entries_per_session: 3 });
    for (const q of ["Q one?", "Q two?", "Q three?"]) expect(addEntry(sample(q), { session: "s1", cwd, now }).code).toBe(0);

    const capped = addEntry(sample("Q four?"), { session: "s1", cwd, now });
    expect(capped.code).toBe(2);
    expect(capped.out).toMatch(/cap reached: 3\/3/);
    expect(capped.out).toContain("2026-10-01-q-one");

    // another session is unaffected
    expect(addEntry(sample("Other session?"), { session: "s2", cwd, now }).code).toBe(0);

    const replaced = addEntry(sample("Q four?"), { session: "s1", cwd, now, replace: "2026-10-01-q-one" });
    expect(replaced.code).toBe(0);
    expect(listEntries().map((e) => e.id)).not.toContain("2026-10-01-q-one");

    const manual = addEntry(sample("Q five?"), { session: "s1", cwd, now, manual: true });
    expect(manual.code).toBe(0);
    expect(manual.out).toMatch(/over the session cap/);
  });

  it("refuses to replace an entry from another session", () => {
    addEntry(sample("Mine?"), { session: "s1", cwd, now });
    const r = addEntry(sample("New?"), { session: "s2", cwd, now, replace: "2026-10-01-mine" });
    expect(r.code).toBe(1);
  });

  it("rejects an entry with no testable line", () => {
    const r = addEntry(sample("x").replace(/testable: .*\n/, ""), { session: "s1", cwd, now });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/testable/);
  });

  it("full weekly loop: quiz-input → record → retest → retire", () => {
    addEntry(sample("Alpha?"), { session: "s1", cwd, now });
    addEntry(sample("Beta?"), { session: "s1", cwd, now });

    let quiz = JSON.parse(quizInput(now).out);
    expect(quiz.fresh).toHaveLength(2);
    expect(quiz.retests).toHaveLength(0);

    expect(recordCmd("2026-10-01-alpha", "got", "explain-why", now).out).toMatch(/not queued/);
    expect(recordCmd("2026-10-01-beta", "missed", "find-the-bug", now).out).toMatch(/next retest 2026-10-08/);
    finishTest(now);
    expect(readConfig().last_test_at).toBe(now.toISOString());

    // nothing due yet, nothing fresh
    quiz = JSON.parse(quizInput(new Date("2026-10-05T00:00:00Z")).out);
    expect(quiz.fresh).toHaveLength(0);
    expect(quiz.retests).toHaveLength(0);

    const wk2 = new Date("2026-10-08T12:00:00Z");
    quiz = JSON.parse(quizInput(wk2).out);
    expect(quiz.retests.map((e: { id: string }) => e.id)).toEqual(["2026-10-01-beta"]);
    recordCmd("2026-10-01-beta", "got", "find-the-bug", wk2);
    expect(recordCmd("2026-10-01-beta", "got", "explain-why", new Date("2026-10-22T12:00:00Z")).out).toMatch(/retired/);
    expect(readQueue()).toEqual({});

    const results = readResults();
    expect(results.map((r) => r.is_retest)).toEqual([false, false, true, true]);
    expect(statsCmd().out).toMatch(/retest pass\s+100%/);
  });

  it("suppress removes an entry from future quizzes and the queue", () => {
    addEntry(sample("Unfair?"), { session: "s1", cwd, now });
    recordCmd("2026-10-01-unfair", "missed", "recall", now);
    suppressCmd("2026-10-01-unfair");
    expect(readQueue()).toEqual({});
    const quiz = JSON.parse(quizInput(new Date("2026-11-01T00:00:00Z")).out);
    expect(quiz.fresh).toHaveLength(0);
    expect(quiz.retests).toHaveLength(0);
  });

  it("validates record arguments", () => {
    addEntry(sample("V?"), { session: "s1", cwd, now });
    expect(recordCmd("2026-10-01-v", "great", "recall").code).toBe(1);
    expect(recordCmd("2026-10-01-v", "got", "essay").code).toBe(1);
    expect(recordCmd("nope", "got", "recall").code).toBe(1);
  });
});
