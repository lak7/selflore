import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./fsutil.js";
import { paths } from "./paths.js";

export interface ServerState {
  port: number;
  pid: number;
  token: string;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function healthy(s: ServerState): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${s.port}/api/health`, {
      headers: { "x-selflore-token": s.token },
      signal: AbortSignal.timeout(1000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** The running notes server, if there is one and it answers. */
export async function runningServer(): Promise<ServerState | null> {
  const s = readJson<ServerState | null>(paths.serverState(), null);
  if (!s || !s.port || !s.pid || !s.token || !alive(s.pid)) return null;
  return (await healthy(s)) ? s : null;
}

/** notes-server.js sits next to this file's parent: dist/lib/server-launch.js → dist/notes-server.js. */
function serverScript(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "notes-server.js");
}

/** Reuse the running notes server or start a detached one. Resolves to null if it can't start. */
export async function ensureServer(timeoutMs = 5000): Promise<ServerState | null> {
  const running = await runningServer();
  if (running) return running;
  const script = serverScript();
  if (!fs.existsSync(script)) return null;

  return new Promise((resolve) => {
    let done = false;
    const finish = (v: ServerState | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.stdout?.destroy();
      child.unref();
      resolve(v);
    };
    const child = spawn(process.execPath, [script], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
    const timer = setTimeout(() => finish(null), timeoutMs);
    let out = "";
    child.on("error", () => finish(null));
    child.on("exit", () => finish(null));
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => {
      out += c;
      if (!out.includes("\n")) return;
      // The child wrote server.json before printing its port.
      const s = readJson<ServerState | null>(paths.serverState(), null);
      finish(s && s.port === Number(out.trim()) ? s : null);
    });
  });
}
