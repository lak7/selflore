import { configExists, readConfig } from "./config.js";
import { keepWriteFor, spawnWorker, type Spawner } from "./background.js";
import { isCapturing, readSession, takeAnnounce, updateSession } from "./session.js";
import { anyTrigger, describeTriggers, detectTriggers, MIN_LINES, readTranscriptFrom, type WriteInfo } from "./transcript.js";
import { listEntries } from "./entries.js";
import { sessionStartContext } from "./nudge.js";
import type { HookInput } from "../hooks/io.js";

export type StopOutcome = "none" | "off" | "locked" | "spawned" | "spawn-failed" | "pending";

export interface StopDeps {
  spawn?: Spawner;
  keepWrite?: (w: WriteInfo) => boolean;
  now?: Date;
}

/**
 * The Stop hook. It never blocks the turn: it only looks at work since the last capture and,
 * if that work has triggers, either starts a detached background capture or (quiet mode)
 * leaves a hint for the next prompt.
 */
export function handleStop(input: HookInput, deps: StopDeps = {}): StopOutcome {
  if (!input.session_id || !configExists()) return "none";
  const config = readConfig();
  if (config.capture === "off") return "off";

  const now = deps.now ?? new Date();
  const session = readSession(input.session_id);
  // Don't advance past work a running capture hasn't finished; it'll be picked up next turn.
  if (config.capture === "background" && isCapturing(session, now)) return "locked";

  const cwd = input.cwd ?? process.cwd();
  const { text, start, end } = readTranscriptFrom(input.transcript_path, session.scanned_offset);
  const triggers = detectTriggers(text, {
    minLines: MIN_LINES[config.capture_intensity],
    keepWrite: deps.keepWrite ?? keepWriteFor(cwd),
  });
  // No triggers: leave the offset where it is, so small steps across turns are judged together.
  if (!anyTrigger(triggers)) return "none";

  if (config.capture === "quiet") {
    updateSession(input.session_id, { scanned_offset: end, pending: describeTriggers(triggers) });
    return "pending";
  }

  const ok = (deps.spawn ?? spawnWorker)({
    session: input.session_id,
    transcript: input.transcript_path!,
    from: start,
    to: end,
    cwd,
  });
  if (!ok) return "spawn-failed";
  updateSession(input.session_id, { scanned_offset: end, capturing_since: now.toISOString() });
  return "spawned";
}

/** UserPromptSubmit (quiet mode): one context line asking Claude to log at a natural pause. */
export function handlePromptSubmit(input: HookInput): string {
  if (!input.session_id || !configExists()) return "";
  if (readConfig().capture !== "quiet") return "";
  const session = readSession(input.session_id);
  if (!session.pending) return "";
  updateSession(input.session_id, { pending: null });
  return (
    `selflore: recent work had ${session.pending}. At a natural pause in this task (not mid-step, and never instead of answering the user), ` +
    `use the selflore skill to log any lore-worthy moments (session_id=${input.session_id}). Don't mention this unless you log something.`
  );
}

export function handleSessionStart(input: HookInput, now = new Date()): string {
  if (!configExists()) return "";
  const config = readConfig();
  const oldest = listEntries()[0]?.date ?? null; // ids are date-prefixed, so sorted oldest first
  const lines = [sessionStartContext(input.session_id, config, oldest, now)];
  const captured = takeAnnounce();
  if (captured > 0)
    lines.push(
      `selflore: captured ${captured} ${captured === 1 ? "entry" : "entries"} in the background since the last session. ` +
        "Mention this once, in one short line, at the start of your first reply; then don't bring it up again.",
    );
  return lines.filter(Boolean).join("\n");
}
