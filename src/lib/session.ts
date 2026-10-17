import path from "node:path";
import { readJson, writeJson } from "./fsutil.js";
import { paths } from "./paths.js";

export interface SessionState {
  entries: string[]; // entry ids logged (or merged into) in this session
  scanned_offset: number; // transcript byte offset up to which work has been handed to capture
  pending: string | null; // quiet mode: trigger summary waiting to be hinted on the next prompt
  capturing_since: string | null; // background mode: lock while a capture worker runs (ISO time)
}

const EMPTY: SessionState = { entries: [], scanned_offset: 0, pending: null, capturing_since: null };

function file(sessionId: string): string {
  return path.join(paths.state(), `${sessionId.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
}

export function readSession(sessionId: string): SessionState {
  // Spread over defaults so v0.2 state files ({entries, nudged}) keep working.
  const { nudged: _legacy, ...raw } = readJson<Partial<SessionState> & { nudged?: boolean }>(file(sessionId), {});
  return { ...EMPTY, ...raw };
}

export function writeSession(sessionId: string, s: SessionState): void {
  writeJson(file(sessionId), s);
}

export function updateSession(sessionId: string, change: Partial<SessionState>): SessionState {
  const next = { ...readSession(sessionId), ...change };
  writeSession(sessionId, next);
  return next;
}

export const LOCK_TTL_MS = 10 * 60 * 1000;

export function isCapturing(s: SessionState, now = new Date()): boolean {
  return s.capturing_since !== null && now.getTime() - new Date(s.capturing_since).getTime() < LOCK_TTL_MS;
}

// Background captures not yet mentioned to the user; announced once at the next session start.
const announceFile = () => path.join(paths.state(), "_announce.json");

export function addAnnounce(n: number): void {
  if (n <= 0) return;
  const cur = readJson<{ count: number }>(announceFile(), { count: 0 });
  writeJson(announceFile(), { count: cur.count + n });
}

export function takeAnnounce(): number {
  const cur = readJson<{ count: number }>(announceFile(), { count: 0 });
  if (cur.count > 0) writeJson(announceFile(), { count: 0 });
  return cur.count;
}
