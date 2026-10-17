import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.js";
import type { Level } from "./entries.js";
import type { Grade } from "./queue.js";

// detail-level: predict-behavior, find-the-bug, rewrite-from-spec; design-level: explain-why, what-breaks, tradeoff-at-scale.
export const QUESTION_TYPES = [
  "explain-why",
  "what-breaks",
  "tradeoff-at-scale",
  "predict-behavior",
  "find-the-bug",
  "rewrite-from-spec",
  "recall",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface Result {
  ts: string;
  entry_id: string;
  project: string;
  skill: string;
  level?: Level; // absent on results recorded before v0.3
  question_type: QuestionType;
  grade: Grade;
  is_retest: boolean;
}

export function appendResult(r: Result): void {
  fs.mkdirSync(path.dirname(paths.results()), { recursive: true });
  fs.appendFileSync(paths.results(), JSON.stringify(r) + "\n");
}

export function readResults(): Result[] {
  let text: string;
  try {
    text = fs.readFileSync(paths.results(), "utf8");
  } catch {
    return [];
  }
  const out: Result[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as Result);
    } catch {
      // skip a corrupt line rather than losing the whole history
    }
  }
  return out;
}

export function testedEntryIds(results: Result[]): Set<string> {
  return new Set(results.map((r) => r.entry_id));
}
