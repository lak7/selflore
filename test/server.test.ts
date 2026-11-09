import { describe, expect, it } from "vitest";
import { addEntry, buildWebQuiz, quizInput, recordCmd, statsCmd, suppressCmd } from "../src/lib/commands.js";
import { readConfig, writeConfig } from "../src/lib/config.js";
import { readQueue } from "../src/lib/queue.js";
import { readResults } from "../src/lib/results.js";
import { handle, type Req } from "../src/lib/server.js";
import { sample, useTempHomes } from "./helpers.js";

const cwd = process.cwd();
const now = new Date("2026-10-01T10:00:00Z");
const WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima", "mike", "november"];

function add(word: string, kind = "bug", skill = "debugging", date = now): string {
  const md = sample(`Why does ${word} matter?`).replace("kind: bug", `kind: ${kind}`).replace("skill: debugging", `skill: ${skill}`);
  const r = addEntry(md, { session: "s", cwd, now: date });
  expect(r.code).toBe(0);
  return r.out.split(" ")[1];
}

const opts = { port: 4321, token: "secret", now };
const req = (over: Partial<Req>): Req => ({ method: "GET", url: "/", host: "127.0.0.1:4321", token: "secret", body: "", ...over });

describe("web test", () => {
  useTempHomes();

  it("puts due retests first and follows the focus split, keep_sharp skills first", () => {
    writeConfig({ ...readConfig(), keep_sharp: ["postgres"] });
    const old = add("alpha", "bug", "debugging", new Date("2026-09-20T10:00:00Z"));
    recordCmd(old, "missed", "recall", new Date("2026-09-20T10:00:00Z"));
    WORDS.slice(1, 8).forEach((w) => add(w, "decision", w === "golf" ? "postgres" : "architecture"));
    WORDS.slice(8, 14).forEach((w) => add(w, "concept", w === "lima" ? "postgres" : "react"));

    const quiz = buildWebQuiz(now);
    expect(quiz).toHaveLength(10);
    expect(quiz[0]).toMatchObject({ id: old, retest: true });
    const design = quiz.filter((q) => q.level === "design");
    const detail = quiz.filter((q) => q.level === "detail" && !q.retest);
    expect(design.length + detail.length).toBe(9);
    expect(Math.abs(design.length - detail.length)).toBeLessThanOrEqual(1); // mixed/balanced
    expect(design[0].skill).toBe("postgres");
    expect(detail[0].skill).toBe("postgres");
    expect(quiz[1].snippet).toContain("insertIgnore");
  });

  it("never pads, and leaves out suppressed and stale entries", () => {
    const a = add("alpha");
    add("bravo");
    add("charlie", "bug", "debugging", new Date("2026-08-01T10:00:00Z"));
    suppressCmd(a);
    expect(buildWebQuiz(now).map((q) => q.testable)).toEqual(["Why does bravo matter?"]);
  });

  it("answering part of a test leaves only the rest; skipped questions stay", () => {
    WORDS.slice(0, 10).forEach((w) => add(w));
    const first = buildWebQuiz(now);
    expect(first).toHaveLength(10);
    for (const q of first.slice(0, 3)) {
      const r = handle(req({ method: "POST", url: "/api/answer", body: JSON.stringify({ entry_id: q.id, grade: "got" }) }), opts);
      expect(r.status).toBe(200);
    }
    const again = buildWebQuiz(now);
    expect(again).toHaveLength(7);
    expect(again.map((q) => q.id)).toEqual(first.slice(3).map((q) => q.id));
    expect(readConfig().last_test_at).toBe(now.toISOString());
  });

  it("records a web answer with its source and queues misses", () => {
    const id = add("alpha");
    const r = handle(req({ method: "POST", url: "/api/answer", body: JSON.stringify({ entry_id: id, grade: "missed", answer: "  no idea  " }) }), opts);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).message).toMatch(/next retest 2026-10-08/);
    expect(readResults()[0]).toMatchObject({ entry_id: id, grade: "missed", source: "web", answer: "no idea", question_type: "recall" });
    expect(readQueue()[id].due.map((d) => d.slice(0, 10))).toEqual(["2026-10-08", "2026-10-22"]);
    expect(statsCmd().out).toContain("self-graded (web)      1 of 1 answers");

    const bad = handle(req({ method: "POST", url: "/api/answer", body: JSON.stringify({ entry_id: id, grade: "great" }) }), opts);
    expect(bad.status).toBe(400);
  });

  it("suppresses an unfair question", () => {
    const id = add("alpha");
    expect(handle(req({ method: "POST", url: "/api/suppress", body: JSON.stringify({ entry_id: id }) }), opts).status).toBe(200);
    expect(buildWebQuiz(now)).toEqual([]);
  });

  it("rejects a bad token or a foreign Host, and serves the page with the test on", () => {
    add("alpha");
    expect(handle(req({ url: "/api/quiz", token: "nope" }), opts).status).toBe(403);
    expect(handle(req({ url: "/api/quiz", host: "evil.example:4321" }), opts).status).toBe(403);
    expect(handle(req({ url: "/", host: "evil.example:4321" }), opts).status).toBe(403);
    expect(JSON.parse(handle(req({ url: "/api/quiz" }), opts).body).questions).toHaveLength(1);
    const page = handle(req({ url: "/?t=secret" }), opts);
    expect(page.status).toBe(200);
    expect(page.body).toContain('"server":true');
    expect(page.body).toContain('id="testbtn"');
  });

  it("keeps quiz-input JSON as the skill expects", () => {
    add("alpha");
    const quiz = JSON.parse(quizInput(now).out);
    expect(Object.keys(quiz)).toEqual(["now", "config", "target_questions", "target_split", "stale_count", "retests", "fresh"]);
    expect(quiz.fresh[0].focus).toBe("mixed");
  });
});
