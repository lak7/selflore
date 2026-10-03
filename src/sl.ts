#!/usr/bin/env node
// Data CLI the selflore skill calls for bookkeeping that must be exact.
import { readStdin } from "./hooks/io.js";
import {
  addEntry,
  finishTest,
  listCmd,
  notesCmd,
  quizInput,
  recordCmd,
  statsCmd,
  suppressCmd,
  type CmdResult,
} from "./lib/commands.js";

const USAGE = `usage: sl <command>
  entry add --session <id> [--manual]     read entry markdown from stdin and store it
  entry replace <id> --session <id>       swap a weaker entry from this session for the one on stdin
  entry list [--session <id>]
  quiz-input                              JSON of fresh entries + due retests
  record --entry <id> --grade got|partial|missed --type <question-type>
  suppress <id>                           flag an entry as unfair; never test it again
  finish-test
  stats [--project <name>]
  notes [--all] [--project <name>] [--text]  open the notes page (or print text)`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(argv: string[]): Promise<CmdResult> {
  const [cmd, sub, ...rest] = argv;
  const args = [sub, ...rest].filter((a): a is string => a !== undefined);

  switch (cmd) {
    case "entry": {
      const session = flag(args, "session");
      if (sub === "list") return listCmd(session);
      if (sub !== "add" && sub !== "replace") break;
      if (!session) return { code: 1, out: "missing --session <id> (it is in the session context as selflore session_id=…)" };
      const replace = sub === "replace" ? rest[0] : undefined;
      if (sub === "replace" && (!replace || replace.startsWith("--"))) return { code: 1, out: "usage: entry replace <id> --session <id>" };
      return addEntry(await readStdin(), {
        session,
        cwd: process.cwd(),
        manual: args.includes("--manual"),
        replace,
      });
    }
    case "quiz-input":
      return quizInput();
    case "record": {
      const entry = flag(args, "entry");
      const grade = flag(args, "grade");
      const type = flag(args, "type");
      if (!entry || !grade || !type) break;
      return recordCmd(entry, grade, type);
    }
    case "suppress":
      if (!sub) break;
      return suppressCmd(sub);
    case "finish-test":
      return finishTest();
    case "stats":
      return statsCmd(flag(args, "project"));
    case "notes":
      return notesCmd({ all: args.includes("--all"), project: flag(args, "project"), text: args.includes("--text") });
  }
  return { code: 1, out: USAGE };
}

main(process.argv.slice(2)).then(
  (r) => {
    (r.code === 0 ? process.stdout : process.stderr).write(r.out + "\n");
    process.exit(r.code);
  },
  (err) => {
    process.stderr.write(`sl: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
