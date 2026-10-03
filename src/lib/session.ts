import path from "node:path";
import { readJson, writeJson } from "./fsutil.js";
import { paths } from "./paths.js";

export interface SessionState {
  entries: string[]; // entry ids logged in this session
  nudged: boolean;
}

function file(sessionId: string): string {
  return path.join(paths.state(), `${sessionId.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
}

export function readSession(sessionId: string): SessionState {
  return readJson<SessionState>(file(sessionId), { entries: [], nudged: false });
}

export function writeSession(sessionId: string, s: SessionState): void {
  writeJson(file(sessionId), s);
}
