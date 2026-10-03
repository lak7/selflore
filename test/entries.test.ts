import { describe, expect, it } from "vitest";
import { parseEntry, serializeEntry, splitBody, validateEntry, type Entry } from "../src/lib/entries.js";
import { SAMPLE } from "./helpers.js";

describe("entries", () => {
  it("parses frontmatter, strips inline comments, keeps snippet in body", () => {
    const e = parseEntry(SAMPLE);
    expect(e.kind).toBe("bug");
    expect(e.paths).toEqual(["src/payments/webhook.ts"]);
    expect(e.testable).toMatch(/^Why must the Stripe webhook/);
    expect(splitBody(e.body!).snippet).toContain("insertIgnore");
    expect(validateEntry(e)).toEqual([]);
  });

  it("round-trips through serialize", () => {
    const e: Entry = {
      id: "2026-09-29-x",
      date: "2026-09-29",
      session: "s1",
      project: "acme-api",
      commit: "abc1234",
      kind: "decision",
      skill: "architecture",
      paths: ["a.ts", "b/c.ts"],
      testable: 'Why "queue" over cron: what breaks?',
      suppressed: false,
      body: "Because reasons.",
    };
    expect({ ...parseEntry(serializeEntry(e)) }).toEqual(e);
  });

  it("rejects entries without a testable line or with bad fields", () => {
    const errors = validateEntry({ kind: "nope" as never, skill: "", body: "" });
    expect(errors.join("\n")).toMatch(/testable/);
    expect(errors.join("\n")).toMatch(/kind/);
    expect(errors.join("\n")).toMatch(/skill/);
    expect(errors.join("\n")).toMatch(/empty/);
  });

  it("enforces the word and snippet limits", () => {
    const long = parseEntry(SAMPLE.replace("Retries caused", "word ".repeat(200)));
    expect(validateEntry(long).join()).toMatch(/words/);
    const bigSnippet = parseEntry(SAMPLE.replace("if (!(await", "x\n".repeat(50) + "if (!(await"));
    expect(validateEntry(bigSnippet).join()).toMatch(/snippet/);
  });
});
