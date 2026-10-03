import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addEntry, notesCmd, recordCmd, suppressCmd } from "../src/lib/commands.js";
import { buildNotesData, embedJson, renderNotesHtml, toCard } from "../src/lib/notes-html.js";
import { sample, useTempHomes } from "./helpers.js";

const cwd = process.cwd();
const now = new Date(2026, 9, 3, 12, 0);

describe("notes page", () => {
  const homes = useTempHomes();
  beforeEach(() => {
    process.env.SELFLORE_NO_OPEN = "1";
  });
  afterEach(() => {
    delete process.env.SELFLORE_NO_OPEN;
  });

  it("builds cards with status, prose/snippet split and language", () => {
    addEntry(sample("Untested one?"), { session: "s", cwd, now });
    addEntry(sample("Queued one?"), { session: "s", cwd, now });
    addEntry(sample("Tested one?"), { session: "s", cwd, now });
    addEntry(sample("Hidden one?"), { session: "s", cwd, now, manual: true });
    recordCmd("2026-10-03-queued-one", "missed", "recall", now);
    recordCmd("2026-10-03-tested-one", "got", "recall", now);
    suppressCmd("2026-10-03-hidden-one");

    const data = buildNotesData(now);
    expect(data.week_start).toBe("2026-09-28");
    const byId = Object.fromEntries(data.entries.map((c) => [c.id, c]));
    expect(byId["2026-10-03-untested-one"].status).toBe("untested");
    expect(byId["2026-10-03-queued-one"].status).toBe("retest");
    expect(byId["2026-10-03-queued-one"].retest_due).toMatch(/^2026-10-10/);
    expect(byId["2026-10-03-tested-one"].status).toBe("tested");
    expect(byId["2026-10-03-hidden-one"].status).toBe("suppressed");

    const card = byId["2026-10-03-untested-one"];
    expect(card.prose).toMatch(/^Retries caused/);
    expect(card.prose).not.toContain("```");
    expect(card.snippet).toBe("if (!(await insertIgnore(evt.id))) return;");
    expect(card.snippetLang).toBe("ts");
  });

  it("escapes entry text so it cannot break out of the data script", () => {
    const evil = "</script><script>alert(1)</script>";
    const html = renderNotesHtml({
      generated_at: now.toISOString(),
      week_start: "2026-09-28",
      rating: 5,
      keep_sharp: [],
      entries: [
        toCard(
          { id: "x", date: "2026-10-01", session: "", project: "p", commit: "", kind: "bug", skill: "s", paths: [], testable: evil, suppressed: false, body: evil },
          new Set(),
          {},
        ),
      ],
    });
    const dataBlock = html.slice(html.indexOf('id="selflore-data">'), html.indexOf("</script>", html.indexOf('id="selflore-data">')));
    expect(dataBlock).not.toContain("<");
    expect(html.match(/<\/script>/g)).toHaveLength(2); // only our own two script tags
    expect(JSON.parse(embedJson({ t: evil }))).toEqual({ t: evil });
  });

  it("notes writes the page without opening when SELFLORE_NO_OPEN is set; --text keeps plain output", () => {
    addEntry(sample("Page?"), { session: "s", cwd, now });
    const r = notesCmd({ all: true, project: "v0" }, now);
    const file = path.join(homes.sl(), "notes.html");
    expect(r.out).toBe(`notes page written: file://${file}`);
    const html = fs.readFileSync(file, "utf8");
    expect(html).toContain("<title>selflore notes</title>");
    expect(html).toContain('"initial":{"all":true,"project":"v0"}');
    expect(html).toContain("Page?");

    expect(notesCmd({ text: true }, now).out).toMatch(/^selflore notes — week of 2026-09-28/);
  });
});
