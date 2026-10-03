import os from "node:os";
import path from "node:path";

// Resolved at call time so tests (and power users) can override via env.
export function selfloreHome(): string {
  return process.env.SELFLORE_HOME ?? path.join(os.homedir(), ".selflore");
}

export function claudeHome(): string {
  return process.env.CLAUDE_HOME ?? path.join(os.homedir(), ".claude");
}

export const paths = {
  config: () => path.join(selfloreHome(), "config.json"),
  entries: () => path.join(selfloreHome(), "entries"),
  results: () => path.join(selfloreHome(), "results.jsonl"),
  queue: () => path.join(selfloreHome(), "queue.json"),
  state: () => path.join(selfloreHome(), "state"),
  app: () => path.join(selfloreHome(), "app"),
  skill: () => path.join(claudeHome(), "skills", "selflore"),
  settings: () => path.join(claudeHome(), "settings.json"),
};
