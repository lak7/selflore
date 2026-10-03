import { spawn } from "node:child_process";

/** Open a file in the default browser. Returns false if skipped or the opener couldn't start. */
export function openInBrowser(file: string): boolean {
  if (process.env.SELFLORE_NO_OPEN) return false;
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [file]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", file]]
        : ["xdg-open", [file]];
  try {
    const child = spawn(cmd, args as string[], { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
