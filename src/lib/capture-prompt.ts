import { describeFocus, type Config, type Focus } from "./config.js";

const INTENSITY_BAR = {
  light: "Only the biggest moments: a significant bug root-caused, a major design decision, or a substantial module the user clearly did not read. Most chunks yield 0 entries.",
  normal: "Real units of work: a bug root-caused and fixed, a non-obvious tradeoff with a stated reason, a new library/API/pattern, a ~30+ line module the user did not read, or the user correcting the agent. Routine edits yield 0 entries.",
  thorough: "Anything the user would benefit from understanding, including smaller gotchas, edge cases and API behaviour discovered along the way. Still skip renames, formatting and config tweaks.",
} as const;

function focusRule(focus: Focus): string {
  if (focus.mode === "details")
    return 'Capture only level "detail": language, library and API specifics — how something behaves, edge cases, gotchas, what a snippet does.';
  if (focus.mode === "design")
    return 'Capture only level "design": architecture, data flow, tradeoffs, failure modes, why it is built this way, what breaks at scale.';
  const lean = { design: "Lean toward design (about 70/30).", balanced: "Aim for a balance of both.", details: "Lean toward detail (about 70/30)." }[focus.balance];
  return `Capture both levels, tagging each honestly ("detail" = language/library specifics; "design" = architecture and tradeoffs). ${lean}`;
}

/** System prompt for the headless background capture call. Output: a JSON array, nothing else. */
export function capturePrompt(config: Config, focus: Focus): string {
  return `You are selflore's capture step. You read an excerpt of a Claude Code session in which an AI agent did work for a developer, and you extract "lore": moments the developer should understand but probably doesn't, because the agent did the work. Each entry becomes a quiz question in the developer's weekly test.

Bar for logging (intensity: ${config.capture_intensity}): ${INTENSITY_BAR[config.capture_intensity]}
Focus (${describeFocus(focus)}): ${focusRule(focus)}
The developer wants to keep sharp: ${config.keep_sharp.join(", ") || "anything"}. Prefer moments in those areas.
Self-rating ${config.rating}/10: ${config.rating <= 3 ? "favour fundamentals" : config.rating >= 8 ? "favour tradeoffs and failure modes" : "balanced depth"}.

Rules:
- The "testable" question is the gate. It must test understanding (why / what breaks / what happens if / what does this print and why), never trivia like names or file locations. If you cannot write one sharp question, skip the moment.
- Prefer one deep entry over several shallow ones. Do not log the same idea twice.
- Skip anything the developer wrote themselves, reports/docs the agent wrote for them to read, and throwaway one-off scripts.
- "body" is the answer key: at most ~120 words with the facts a correct answer must contain (the why, the root cause, the alternative rejected).
- "snippet" (optional, max 40 lines): the essential code as it is now. For a bug, the fixed code; name the original bug in the body.

Output ONLY a JSON array (possibly empty, []), no prose, no code fences. Each element:
{"kind": "bug"|"decision"|"concept"|"pattern", "level": "detail"|"design", "skill": "<one of the keep-sharp areas or a stack name>", "paths": ["relative/path"], "testable": "<question>", "body": "<answer key>", "snippet": "<code or omit>", "snippet_lang": "<ts|py|…|omit>"}`;
}
