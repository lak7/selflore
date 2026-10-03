import { describe, expect, it } from "vitest";
import { applyGrade, dueItems, type Queue } from "../src/lib/queue.js";

const DAY = 86_400_000;
const t0 = new Date("2026-10-01T10:00:00Z");
const at = (days: number) => new Date(t0.getTime() + days * DAY);

describe("retest queue", () => {
  it("a first-attempt pass is not queued", () => {
    expect(applyGrade({}, "a", "got", t0)).toEqual({});
  });

  it("miss and partial schedule +7d and +21d", () => {
    for (const grade of ["missed", "partial"] as const) {
      const q = applyGrade({}, "a", grade, t0);
      expect(q.a.due).toEqual([at(7).toISOString(), at(21).toISOString()]);
      expect(q.a.streak).toBe(0);
    }
  });

  it("retires only after two consecutive passes", () => {
    let q: Queue = applyGrade({}, "a", "missed", t0);
    q = applyGrade(q, "a", "got", at(7));
    expect(q.a.streak).toBe(1);
    expect(q.a.due).toEqual([at(21).toISOString()]);
    q = applyGrade(q, "a", "got", at(21));
    expect(q.a).toBeUndefined();
  });

  it("a miss on retest resets the streak and schedule", () => {
    let q: Queue = applyGrade({}, "a", "missed", t0);
    q = applyGrade(q, "a", "got", at(7));
    q = applyGrade(q, "a", "partial", at(21));
    expect(q.a.streak).toBe(0);
    expect(q.a.due[0]).toBe(at(28).toISOString());
    expect(q.a.added_at).toBe(t0.toISOString());
  });

  it("dueItems returns only items whose next date has passed", () => {
    const q = applyGrade(applyGrade({}, "a", "missed", t0), "b", "missed", at(3));
    expect(dueItems(q, at(6)).map((i) => i.entry_id)).toEqual([]);
    expect(dueItems(q, at(7)).map((i) => i.entry_id)).toEqual(["a"]);
    expect(dueItems(q, at(10)).map((i) => i.entry_id)).toEqual(["a", "b"]);
  });
});
