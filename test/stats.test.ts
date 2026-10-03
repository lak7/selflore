import { describe, expect, it } from "vitest";
import type { Entry } from "../src/lib/entries.js";
import type { Result } from "../src/lib/results.js";
import { renderStats, weekOf } from "../src/lib/stats.js";

const entry = (id: string, date: string, skill: string, project = "acme"): Entry => ({
  id,
  date,
  session: "s",
  project,
  commit: "",
  kind: "bug",
  skill,
  paths: [],
  testable: "q?",
  suppressed: false,
  body: "b",
});

const result = (entry_id: string, ts: string, skill: string, grade: Result["grade"], is_retest = false, project = "acme"): Result => ({
  ts,
  entry_id,
  project,
  skill,
  question_type: "explain-why",
  grade,
  is_retest,
});

describe("stats", () => {
  it("weekOf returns the Monday", () => {
    expect(weekOf("2026-10-01")).toBe("2026-09-28"); // Thursday
    expect(weekOf("2026-10-04")).toBe("2026-09-28"); // Sunday
    expect(weekOf("2026-10-05T08:00:00Z")).toBe("2026-10-05"); // Monday
  });

  it("renders weekly rows, per-skill pass rates and the rating gap", () => {
    const out = renderStats({
      entries: [entry("a", "2026-09-29", "debugging"), entry("b", "2026-09-30", "architecture"), entry("c", "2026-10-06", "debugging", "other")],
      results: [
        result("a", "2026-10-02T10:00:00Z", "debugging", "got"),
        result("b", "2026-10-02T10:05:00Z", "architecture", "missed"),
        result("b", "2026-10-09T10:00:00Z", "architecture", "got", true),
      ],
      queue: { b: { entry_id: "b", due: ["2026-10-23T00:00:00Z"], streak: 1, added_at: "" } },
      rating: 8,
    });
    expect(out).toMatch(/2026-09-28\s+2\s+2\s+50%\s+0%\s+100%/);
    expect(out).toMatch(/2026-10-05\s+1\s+1\s+100%\s+100%\s+–/);
    expect(out).toMatch(/first-attempt pass\s+50%/);
    expect(out).toMatch(/retest pass\s+100%/);
    expect(out).toMatch(/retest backlog\s+1 queued/);
    expect(out).toMatch(/self-rating\s+8\/10 \(≈80%\) vs observed 67%/);
  });

  it("filters by project", () => {
    const out = renderStats({
      entries: [entry("a", "2026-09-29", "debugging"), entry("c", "2026-10-06", "debugging", "other")],
      results: [],
      queue: {},
      rating: 5,
      project: "other",
    });
    expect(out).toContain("— other");
    expect(out).not.toContain("2026-09-28");
    expect(renderStats({ entries: [], results: [], queue: {}, rating: 5 })).toMatch(/No selflore data/);
  });
});
