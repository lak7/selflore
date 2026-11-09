#!/usr/bin/env node
// Local notes server, started detached by `selflore notes`: serves the notes page and records
// answers from the in-page test. Prints its port once, then exits after a while with no requests.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { writeJson } from "./lib/fsutil.js";
import { paths } from "./lib/paths.js";
import { createNotesServer } from "./lib/server.js";

const IDLE_MS = Number(process.env.SELFLORE_SERVER_IDLE_MS) || 30 * 60 * 1000;
const token = randomBytes(16).toString("hex");

let timer: NodeJS.Timeout | undefined;
function shutdown(): void {
  try {
    const state = JSON.parse(fs.readFileSync(paths.serverState(), "utf8")) as { pid?: number };
    if (state.pid === process.pid) fs.rmSync(paths.serverState(), { force: true });
  } catch {
    // no state file to clean up
  }
  process.exit(0);
}
function touch(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(shutdown, IDLE_MS);
}

const server = createNotesServer({ token, onRequest: touch });
server.on("error", () => process.exit(1));
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  writeJson(paths.serverState(), { port, pid: process.pid, token });
  touch();
  // The parent reads this line, then stops listening; nothing is written to stdout after it.
  process.stdout.write(`${port}\n`);
});
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
