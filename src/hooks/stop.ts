#!/usr/bin/env node
import { configExists, readConfig } from "../lib/config.js";
import { readSession, writeSession } from "../lib/session.js";
import { anyTrigger, describeTriggers, detectTriggers, readTranscript } from "../lib/transcript.js";
import { readHookInput, runHook } from "./io.js";

// Stop fires after every assistant turn. The session state file makes this nudge at most once per session.
runHook(async () => {
  const input = await readHookInput();
  if (input.stop_hook_active || !input.session_id || !configExists()) return;

  const session = readSession(input.session_id);
  if (session.nudged || session.entries.length > 0) return;

  const triggers = detectTriggers(readTranscript(input.transcript_path));
  if (!anyTrigger(triggers)) return;

  writeSession(input.session_id, { ...session, nudged: true });
  const cap = readConfig().max_entries_per_session;
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        `selflore: this session had ${describeTriggers(triggers)} but nothing was logged. ` +
        `Use the selflore skill to log up to ${cap} lore entries (session_id=${input.session_id}), ` +
        `or reply in one line that nothing here is lore-worthy. Do not continue other work.`,
    }) + "\n",
  );
});
