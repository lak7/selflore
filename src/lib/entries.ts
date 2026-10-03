import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.js";

export const KINDS = ["bug", "decision", "concept", "pattern"] as const;
export type Kind = (typeof KINDS)[number];

export const MAX_BODY_WORDS = 150; // PRD says ~120; small grace before rejecting
export const MAX_SNIPPET_LINES = 40;

export interface Entry {
  id: string;
  date: string; // YYYY-MM-DD
  session: string;
  project: string;
  commit: string;
  kind: Kind;
  skill: string;
  paths: string[];
  testable: string;
  suppressed: boolean;
  body: string; // prose + optional fenced snippet
}

const FIELD_ORDER: (keyof Omit<Entry, "body">)[] = [
  "id",
  "date",
  "session",
  "project",
  "commit",
  "kind",
  "skill",
  "paths",
  "testable",
  "suppressed",
];

function parseValue(raw: string): unknown {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v.startsWith("[") && v.endsWith("]")) {
    try {
      return JSON.parse(v);
    } catch {
      return v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
  }
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

/** Parse frontmatter markdown. Unknown keys are ignored; missing ones are left undefined. */
export function parseEntry(text: string): Partial<Entry> {
  const m = text.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { body: text.trim() };
  const out: Record<string, unknown> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    // Strip trailing YAML comments on unquoted scalars (e.g. `kind: bug   # bug | decision`).
    let raw = line.slice(idx + 1);
    if (!/^\s*["'[]/.test(raw)) raw = raw.replace(/\s+#.*$/, "");
    out[key] = parseValue(raw);
  }
  out.body = m[2].trim();
  return out as Partial<Entry>;
}

export function serializeEntry(e: Entry): string {
  const lines = FIELD_ORDER.map((k) => {
    const v = e[k];
    if (Array.isArray(v)) return `${k}: ${JSON.stringify(v)}`;
    if (typeof v === "boolean") return `${k}: ${v}`;
    if (k === "testable") return `${k}: ${JSON.stringify(v)}`;
    return `${k}: ${v}`;
  });
  return `---\n${lines.join("\n")}\n---\n${e.body.trim()}\n`;
}

/** Split body into prose and fenced code so each limit can be checked separately. */
export function splitBody(body: string): { prose: string; snippet: string | null } {
  const fence = body.match(/```[^\n]*\n([\s\S]*?)```/);
  if (!fence) return { prose: body, snippet: null };
  return { prose: body.replace(fence[0], "").trim(), snippet: fence[1] };
}

export function validateEntry(e: Partial<Entry>): string[] {
  const errors: string[] = [];
  if (!e.testable || !String(e.testable).trim())
    errors.push("missing `testable` — if you cannot write a test question, the moment is not worth logging");
  if (!e.kind || !KINDS.includes(e.kind as Kind)) errors.push(`\`kind\` must be one of ${KINDS.join(" | ")}`);
  if (!e.skill || !String(e.skill).trim()) errors.push("missing `skill`");
  const { prose, snippet } = splitBody(e.body ?? "");
  const words = prose.split(/\s+/).filter(Boolean).length;
  if (words === 0) errors.push("body is empty");
  if (words > MAX_BODY_WORDS) errors.push(`body is ${words} words; keep it to ~120`);
  if (snippet && snippet.trimEnd().split("\n").length > MAX_SNIPPET_LINES)
    errors.push(`snippet exceeds ${MAX_SNIPPET_LINES} lines; trim to the essential part`);
  return errors;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split("-")
      .slice(0, 6)
      .join("-") || "entry"
  );
}

export function entryFile(id: string): string {
  return path.join(paths.entries(), `${id}.md`);
}

export function uniqueId(date: string, testable: string): string {
  const base = `${date}-${slugify(testable)}`;
  let id = base;
  for (let i = 2; fs.existsSync(entryFile(id)); i++) id = `${base}-${i}`;
  return id;
}

export function writeEntry(e: Entry): void {
  fs.mkdirSync(paths.entries(), { recursive: true });
  fs.writeFileSync(entryFile(e.id), serializeEntry(e));
}

export function readEntry(id: string): Entry | null {
  try {
    const parsed = parseEntry(fs.readFileSync(entryFile(id), "utf8"));
    return normalize(parsed, id);
  } catch {
    return null;
  }
}

export function deleteEntry(id: string): boolean {
  try {
    fs.unlinkSync(entryFile(id));
    return true;
  } catch {
    return false;
  }
}

export function listEntries(): Entry[] {
  let files: string[];
  try {
    files = fs.readdirSync(paths.entries()).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  return files
    .sort()
    .map((f) => readEntry(f.slice(0, -3)))
    .filter((e): e is Entry => e !== null);
}

function normalize(p: Partial<Entry>, id: string): Entry {
  return {
    id: p.id ?? id,
    date: String(p.date ?? id.slice(0, 10)),
    session: String(p.session ?? ""),
    project: String(p.project ?? ""),
    commit: String(p.commit ?? ""),
    kind: (p.kind ?? "concept") as Kind,
    skill: String(p.skill ?? ""),
    paths: Array.isArray(p.paths) ? p.paths.map(String) : p.paths ? [String(p.paths)] : [],
    testable: String(p.testable ?? ""),
    suppressed: p.suppressed === true,
    body: p.body ?? "",
  };
}
