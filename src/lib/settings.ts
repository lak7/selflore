import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./fsutil.js";
import { paths } from "./paths.js";

interface HookCommand {
  type: string;
  command?: string;
  [k: string]: unknown;
}
interface HookGroup {
  matcher?: string;
  hooks?: HookCommand[];
  [k: string]: unknown;
}
export interface Settings {
  hooks?: Record<string, HookGroup[]>;
  [k: string]: unknown;
}

export const HOOK_SCRIPTS = { SessionStart: "session-start.js", Stop: "stop.js" } as const;

export function hookCommand(appDir: string, script: string): string {
  return `node "${path.join(appDir, "hooks", script)}"`;
}

function isOurs(cmd: HookCommand, appDir: string): boolean {
  const c = cmd.command ?? "";
  return c.includes(path.join(appDir, "hooks")) || /[\\/]\.selflore[\\/]app[\\/]hooks[\\/]/.test(c);
}

/** Remove selflore hook commands, dropping groups/events that end up empty. Other hooks are untouched. */
export function stripHooks(settings: Settings, appDir: string): Settings {
  if (!settings.hooks) return settings;
  const hooks: Record<string, HookGroup[]> = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const kept = groups
      .map((g) => (Array.isArray(g.hooks) ? { ...g, hooks: g.hooks.filter((h) => !isOurs(h, appDir)) } : g))
      .filter((g) => !Array.isArray(g.hooks) || g.hooks.length > 0);
    if (kept.length) hooks[event] = kept;
  }
  const { hooks: _old, ...rest } = settings;
  return Object.keys(hooks).length ? { ...rest, hooks } : rest;
}

/** Idempotently add selflore's hooks (strip then append). */
export function mergeHooks(settings: Settings, appDir: string): Settings {
  const base = stripHooks(settings, appDir);
  const hooks = { ...(base.hooks ?? {}) };
  for (const [event, script] of Object.entries(HOOK_SCRIPTS)) {
    hooks[event] = [...(hooks[event] ?? []), { hooks: [{ type: "command", command: hookCommand(appDir, script) }] }];
  }
  return { ...base, hooks };
}

function loadSettings(): Settings {
  const file = paths.settings();
  if (!fs.existsSync(file)) return {};
  const parsed = readJson<Settings | null>(file, null);
  if (parsed === null) throw new Error(`${file} is not valid JSON; fix it before running selflore`);
  return parsed;
}

export function installHooks(): void {
  const file = paths.settings();
  const settings = loadSettings();
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.selflore-bak`);
  writeJson(file, mergeHooks(settings, paths.app()));
}

export function uninstallHooks(): void {
  const file = paths.settings();
  if (!fs.existsSync(file)) return;
  const settings = loadSettings();
  fs.copyFileSync(file, `${file}.selflore-bak`);
  writeJson(file, stripHooks(settings, paths.app()));
}
