#!/usr/bin/env node
import { configExists, readConfig } from "../lib/config.js";
import { listEntries } from "../lib/entries.js";
import { sessionStartContext } from "../lib/nudge.js";
import { readHookInput, runHook } from "./io.js";

runHook(async () => {
  const input = await readHookInput();
  if (!configExists()) return;
  const oldest = listEntries()[0]?.date ?? null; // ids are date-prefixed, so sorted oldest first
  const out = sessionStartContext(input.session_id, readConfig(), oldest, new Date());
  if (out) process.stdout.write(out + "\n");
});
