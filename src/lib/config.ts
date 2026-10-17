import { readJson, writeJson } from "./fsutil.js";
import { paths } from "./paths.js";

export type KeepSharp = "debugging" | "architecture" | "fundamentals" | string;
export type Intensity = "light" | "normal" | "thorough";
export type FocusMode = "details" | "design" | "mixed";
export type Balance = "design" | "balanced" | "details";
export type CaptureMode = "background" | "quiet" | "off";
export type CaptureModel = "session" | "sonnet" | "haiku";

export interface Focus {
  mode: FocusMode;
  balance: Balance; // only meaningful when mode is "mixed"
}

export interface Config {
  rating: number; // 1–10, self-reported
  keep_sharp: KeepSharp[];
  capture_intensity: Intensity;
  focus: Focus;
  projects: Record<string, Partial<Focus>>; // per-project focus overrides, keyed by projectName()
  capture: CaptureMode;
  capture_model: CaptureModel;
  nudge: boolean;
  cadence: "weekly";
  last_test_at: string | null; // ISO timestamp
}

export const INTENSITIES: Intensity[] = ["light", "normal", "thorough"];
export const FOCUS_MODES: FocusMode[] = ["details", "design", "mixed"];
export const BALANCES: Balance[] = ["design", "balanced", "details"];
export const CAPTURE_MODES: CaptureMode[] = ["background", "quiet", "off"];
export const CAPTURE_MODELS: CaptureModel[] = ["session", "sonnet", "haiku"];

export const DEFAULT_CONFIG: Config = {
  rating: 5,
  keep_sharp: ["debugging"],
  capture_intensity: "normal",
  focus: { mode: "mixed", balance: "balanced" },
  projects: {},
  capture: "background",
  capture_model: "session",
  nudge: true,
  cadence: "weekly",
  last_test_at: null,
};

const pick = <T extends string>(v: unknown, allowed: T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** Fill in new fields and convert old ones (v0.2's max_entries_per_session → capture_intensity). */
export function migrateConfig(raw: Record<string, unknown>): Config {
  const legacyCap = typeof raw.max_entries_per_session === "number" ? raw.max_entries_per_session : null;
  const intensityFromCap: Intensity | null =
    legacyCap === null ? null : legacyCap <= 3 ? "light" : legacyCap <= 5 ? "normal" : "thorough";
  const focus = (raw.focus ?? {}) as Partial<Focus>;
  const projects: Record<string, Partial<Focus>> = {};
  for (const [name, f] of Object.entries((raw.projects ?? {}) as Record<string, Partial<Focus>>)) {
    const o: Partial<Focus> = {};
    if (FOCUS_MODES.includes(f?.mode as FocusMode)) o.mode = f.mode;
    if (BALANCES.includes(f?.balance as Balance)) o.balance = f.balance;
    if (Object.keys(o).length) projects[name] = o;
  }

  const { max_entries_per_session: _legacy, ...rest } = raw;
  return {
    ...DEFAULT_CONFIG,
    ...(rest as Partial<Config>),
    capture_intensity: pick(raw.capture_intensity, INTENSITIES, intensityFromCap ?? DEFAULT_CONFIG.capture_intensity),
    focus: {
      mode: pick(focus.mode, FOCUS_MODES, DEFAULT_CONFIG.focus.mode),
      balance: pick(focus.balance, BALANCES, DEFAULT_CONFIG.focus.balance),
    },
    projects,
    capture: pick(raw.capture, CAPTURE_MODES, DEFAULT_CONFIG.capture),
    capture_model: pick(raw.capture_model, CAPTURE_MODELS, DEFAULT_CONFIG.capture_model),
  };
}

export function readConfig(): Config {
  return migrateConfig(readJson<Record<string, unknown>>(paths.config(), {}));
}

export function configExists(): boolean {
  return readJson<Partial<Config> | null>(paths.config(), null) !== null;
}

export function writeConfig(config: Config): void {
  writeJson(paths.config(), config);
}

/** The focus that applies to a project: its override wins, field by field, over the global focus. */
export function effectiveFocus(config: Config, project?: string): Focus & { source: "global" | "project" } {
  const o = project ? config.projects[project] : undefined;
  return {
    mode: o?.mode ?? config.focus.mode,
    balance: o?.balance ?? config.focus.balance,
    source: o && (o.mode || o.balance) ? "project" : "global",
  };
}

/** How many of `total` quiz questions should be design-level for a focus. */
export function designShare(focus: Focus): number {
  if (focus.mode === "design") return 1;
  if (focus.mode === "details") return 0;
  return focus.balance === "design" ? 0.7 : focus.balance === "details" ? 0.3 : 0.5;
}

export function describeFocus(focus: Focus): string {
  if (focus.mode !== "mixed") return focus.mode;
  const b = { design: "mostly design", balanced: "balanced", details: "mostly details" }[focus.balance];
  return `mixed (${b})`;
}
