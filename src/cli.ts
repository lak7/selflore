#!/usr/bin/env node
import { removeFiles } from "./lib/install.js";
import { selfloreHome } from "./lib/paths.js";

const USAGE = `selflore — own what your agent builds

usage:
  npx selflore init              install skill + hooks, run onboarding (re-run to change answers)
  npx selflore init --yes        non-interactive; keep existing config or use defaults
  npx selflore remove            remove skill + hooks, keep your data
  npx selflore remove --purge    remove everything, including ${selfloreHome()}

inside Claude Code:  /selflore test   /selflore log   /selflore stats`;

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "init": {
      // Imported lazily: the prompt library is only needed here, not in the hook runtime.
      const { init } = await import("./init.js");
      await init({ yes: args.includes("--yes") || args.includes("-y") });
      return;
    }
    case "remove": {
      const purge = args.includes("--purge");
      removeFiles(purge);
      console.log(purge ? `selflore removed, including ${selfloreHome()}` : `selflore removed; data kept in ${selfloreHome()}`);
      return;
    }
    default:
      console.log(USAGE);
      if (cmd && cmd !== "help" && cmd !== "--help" && cmd !== "-h") process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`selflore: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
