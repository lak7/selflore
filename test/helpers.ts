import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";

/** Point SELFLORE_HOME / CLAUDE_HOME at fresh temp dirs for each test. */
export function useTempHomes(): { sl: () => string; claude: () => string } {
  let root = "";
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "selflore-test-"));
    process.env.SELFLORE_HOME = path.join(root, "selflore");
    process.env.CLAUDE_HOME = path.join(root, "claude");
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.SELFLORE_HOME;
    delete process.env.CLAUDE_HOME;
  });
  return { sl: () => process.env.SELFLORE_HOME!, claude: () => process.env.CLAUDE_HOME! };
}

export const SAMPLE = `---
kind: bug            # bug | decision | concept | pattern
skill: debugging
paths: ["src/payments/webhook.ts"]
testable: "Why must the Stripe webhook handler be idempotent, and what fails without it?"
---
Retries caused double refunds. In-memory dedupe fails across pods;
moved to a processed_events table keyed on event id.

\`\`\`ts
if (!(await insertIgnore(evt.id))) return;
\`\`\`
`;

export function sample(testable: string, extra = ""): string {
  return SAMPLE.replace(/testable: ".*"/, `testable: ${JSON.stringify(testable)}`) + extra;
}
