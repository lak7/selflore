#!/usr/bin/env node
// Detached background capture, started by the Stop hook: reads one transcript range,
// asks a headless Claude for lore entries, stores them, then releases the session lock.
import { logWorkerError, runCapture } from "../lib/background.js";
import { addAnnounce, updateSession } from "../lib/session.js";
import { buildExcerpt, lastModel, readTranscriptFrom } from "../lib/transcript.js";

const [session, transcript, from, to, cwd] = process.argv.slice(2);

try {
  if (session && transcript) {
    const { text } = readTranscriptFrom(transcript, Number(from) || 0, Number(to) || undefined);
    const stored = runCapture({ session, cwd: cwd || process.cwd(), excerpt: buildExcerpt(text), sessionModel: lastModel(text) });
    addAnnounce(stored);
  }
} catch (err) {
  logWorkerError(err);
} finally {
  if (session) {
    try {
      updateSession(session, { capturing_since: null });
    } catch {
      // ignore
    }
  }
}
