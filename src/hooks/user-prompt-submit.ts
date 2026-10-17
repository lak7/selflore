#!/usr/bin/env node
import { handlePromptSubmit } from "../lib/hook-logic.js";
import { readHookInput, runHook } from "./io.js";

// Quiet capture mode: turns a pending trigger into one line of context for the next turn. Never blocks.
runHook(async () => {
  const out = handlePromptSubmit(await readHookInput());
  if (out) process.stdout.write(out + "\n");
});
