import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installHooks, mergeHooks, stripHooks, uninstallHooks, type Settings } from "../src/lib/settings.js";
import { useTempHomes } from "./helpers.js";

const APP = "/home/u/.selflore/app";
const existing: Settings = {
  model: "opus",
  hooks: {
    Stop: [{ hooks: [{ type: "command", command: "afplay /System/Library/Sounds/Glass.aiff" }] }],
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "guard.sh" }] }],
  },
};

describe("settings merge", () => {
  it("appends selflore hooks without touching existing ones", () => {
    const merged = mergeHooks(existing, APP);
    expect(merged.model).toBe("opus");
    expect(merged.hooks!.PreToolUse).toEqual(existing.hooks!.PreToolUse);
    expect(merged.hooks!.Stop).toHaveLength(2);
    expect(merged.hooks!.Stop[0]).toEqual(existing.hooks!.Stop[0]);
    expect(merged.hooks!.Stop[1].hooks![0].command).toBe(`node "${APP}/hooks/stop.js"`);
    expect(merged.hooks!.SessionStart[0].hooks![0].command).toBe(`node "${APP}/hooks/session-start.js"`);
  });

  it("is idempotent", () => {
    expect(mergeHooks(mergeHooks(existing, APP), APP)).toEqual(mergeHooks(existing, APP));
  });

  it("strip restores the original settings", () => {
    expect(stripHooks(mergeHooks(existing, APP), APP)).toEqual(existing);
    expect(stripHooks(mergeHooks({}, APP), APP)).toEqual({});
  });

  describe("on disk", () => {
    const homes = useTempHomes();

    it("installs into a missing settings file and uninstalls cleanly with a backup", () => {
      installHooks();
      const file = path.join(homes.claude(), "settings.json");
      const s = JSON.parse(fs.readFileSync(file, "utf8"));
      expect(Object.keys(s.hooks)).toEqual(["SessionStart", "Stop"]);
      uninstallHooks();
      expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({});
      expect(fs.existsSync(`${file}.selflore-bak`)).toBe(true);
    });

    it("refuses to overwrite invalid JSON", () => {
      const file = path.join(homes.claude(), "settings.json");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "{ nope");
      expect(() => installHooks()).toThrow(/not valid JSON/);
      expect(fs.readFileSync(file, "utf8")).toBe("{ nope");
    });
  });
});
