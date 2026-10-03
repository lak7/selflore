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

/** Hooks must never break the user's session: swallow everything and exit 0. */
export function runHook(fn: () => Promise<void>): void {
  fn().catch(() => {}).finally(() => process.exit(0));
}
