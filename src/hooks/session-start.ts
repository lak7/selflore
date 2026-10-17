#!/usr/bin/env node
import { handleSessionStart } from "../lib/hook-logic.js";
import { readHookInput, runHook } from "./io.js";

runHook(async () => {
  const out = handleSessionStart(await readHookInput());
  if (out) process.stdout.write(out + "\n");
});
