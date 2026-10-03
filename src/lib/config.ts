import { readJson, writeJson } from "./fsutil.js";
import { paths } from "./paths.js";

export type KeepSharp = "debugging" | "architecture" | "fundamentals" | string;

export interface Config {
  rating: number; // 1–10, self-reported
  keep_sharp: KeepSharp[];
  max_entries_per_session: number; // 3–7
  nudge: boolean;
  cadence: "weekly";
  last_test_at: string | null; // ISO timestamp
}

export const DEFAULT_CONFIG: Config = {
  rating: 5,
  keep_sharp: ["debugging"],
  max_entries_per_session: 3,
  nudge: true,
  cadence: "weekly",
  last_test_at: null,
};

export function readConfig(): Config {
  return { ...DEFAULT_CONFIG, ...readJson<Partial<Config>>(paths.config(), {}) };
}

export function configExists(): boolean {
  return readJson<Partial<Config> | null>(paths.config(), null) !== null;
}

export function writeConfig(config: Config): void {
  writeJson(paths.config(), config);
}

export function clampCap(n: number): number {
  return Math.min(7, Math.max(3, Math.round(n)));
}
