import { describe, expect, it } from "vitest";
import type { Entry } from "../src/lib/entries.js";
import { renderNotes, weekStart } from "../src/lib/notes.js";

const entry = (id: string, date: string, extra: Partial<Entry> = {}): Entry => ({
  id,
  date,
  session: "s",
  project: "acme",
  commit: "abc1234",
  kind: "bug",
  skill: "debugging",
  paths: ["src/a.ts"],
  testable: `Why ${id}?`,
  suppressed: false,
  body: "Because of retries.\n\n```ts\nline1\nline2\n```",
  ...extra,
});

const now = new Date(2026, 9, 3, 15, 0); // Sat 2026-10-03, local time

describe("notes", () => {
  it("weekStart is the local Monday", () => {
    expect(weekStart(now)).toBe("2026-09-28");
    expect(weekStart(new Date(2026, 8, 28, 0, 30))).toBe("2026-09-28");
    expect(weekStart(new Date(2026, 9, 4, 23, 59))).toBe("2026-09-28"); // Sunday
  });

  it("shows this week's entries grouped by day with status", () => {
    const out = renderNotes({
      entries: [entry("2026-09-20-old", "2026-09-20"), entry("2026-09-29-a", "2026-09-29"), entry("2026-10-01-b", "2026-10-01", { project: "web" })],
      tested: new Set(["2026-09-29-a"]),
      queue: { "2026-09-29-a": { entry_id: "2026-09-29-a", due: ["2026-10-06T00:00:00Z"], streak: 0, added_at: "" } },
      now,
    });
    expect(out).toContain("week of 2026-09-28 (2 entries)");
    expect(out).not.toContain("old");
    expect(out).toMatch(/Tue 2026-09-29\n {2}• \[bug · debugging\] acme · src\/a\.ts {2}\(retest 2026-10-06\)/);
    expect(out).toContain("Q: Why 2026-10-01-b?");
    expect(out).toContain("Because of retries.");
    expect(out).toContain("+ 2-line snippet @ abc1234");
    expect(out).toContain("(untested)");
  });

  it("supports --all, --project and the empty state", () => {
    const entries = [entry("2026-09-20-old", "2026-09-20"), entry("2026-10-01-b", "2026-10-01", { project: "web" })];
    const base = { entries, tested: new Set<string>(), queue: {}, now };
    expect(renderNotes({ ...base, all: true })).toContain("all time (2 entries)");
    expect(renderNotes({ ...base, all: true, project: "web" })).toContain("(1 entry)");
    expect(renderNotes({ ...base, project: "nope" })).toMatch(/Nothing captured yet/);
  });
});
