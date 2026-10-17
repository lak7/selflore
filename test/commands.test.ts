import { describe, expect, it } from "vitest";
import { addEntry, finishTest, projectName, quizInput, recordCmd, statsCmd, suppressCmd } from "../src/lib/commands.js";
import { readConfig } from "../src/lib/config.js";
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

  it("has no per-session cap", () => {
    const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"];
    for (const w of words) expect(addEntry(sample(`Why does ${w} matter here?`), { session: "s1", cwd, now }).code).toBe(0);
    expect(listEntries()).toHaveLength(10);
  });

  it("merges a near-duplicate into the existing untested entry", () => {
    addEntry(sample("Why must the webhook handler be idempotent under retries?"), { session: "s1", cwd, now });
    const r = addEntry(sample("Why must the webhook handler be idempotent when Stripe retries?"), { session: "s2", cwd, now });
    expect(r.out).toMatch(/^updated 2026-10-01-why-must-the-webhook-handler-be/);
    const all = listEntries();
    expect(all).toHaveLength(1);
    expect(all[0].testable).toContain("when Stripe retries");
  });

  it("does not merge into an entry that was already tested, or with an unrelated question", () => {
    addEntry(sample("Why must the webhook handler be idempotent under retries?"), { session: "s1", cwd, now });
    recordCmd("2026-10-01-why-must-the-webhook-handler-be", "got", "explain-why", now);
    expect(addEntry(sample("Why must the webhook handler be idempotent when Stripe retries?"), { session: "s1", cwd, now }).out).toMatch(/^logged/);
    expect(addEntry(sample("How does the token bucket refill?"), { session: "s1", cwd, now }).out).toMatch(/^logged/);
    expect(listEntries()).toHaveLength(3);
  });

  it("stores level, inferring it from kind when omitted", () => {
    addEntry(sample("Why is detail inferred?"), { session: "s1", cwd, now });
    addEntry(sample("Why a queue over cron?").replace("kind: bug ", "kind: decision "), { session: "s1", cwd, now });
    addEntry(sample("Why explicit design?").replace("skill: debugging", "level: design\nskill: debugging"), { session: "s1", cwd, now });
    const byQ = Object.fromEntries(listEntries().map((e) => [e.testable, e.level]));
    expect(byQ["Why is detail inferred?"]).toBe("detail");
    expect(byQ["Why a queue over cron?"]).toBe("design");
    expect(byQ["Why explicit design?"]).toBe("design");
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
