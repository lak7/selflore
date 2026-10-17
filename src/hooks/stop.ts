#!/usr/bin/env node
import { handleStop } from "../lib/hook-logic.js";
import { readHookInput, runHook } from "./io.js";

// Stop fires after every assistant turn. It never blocks: capture happens in the background or via a later hint.
runHook(async () => {
  handleStop(await readHookInput());
});
