export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  stop_hook_active?: boolean;
  source?: string;
}

export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function readHookInput(): Promise<HookInput> {
  try {
    return JSON.parse((await readStdin()) || "{}") as HookInput;
  } catch {
    return {};
  }
}

/**
 * Hooks must never break the user's session: swallow everything and exit 0.
 * Inside selflore's own background capture (SELFLORE_BG), hooks do nothing, so a capture can't trigger another.
 */
export function runHook(fn: () => Promise<void>): void {
  if (process.env.SELFLORE_BG) process.exit(0);
  fn().catch(() => {}).finally(() => process.exit(0));
}
