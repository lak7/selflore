# /selflore test — the weekly test

Target: about 10 questions in about 20 minutes. Tests are meant to measure **understanding**, not recall.

## 1. Load the material

```bash
{{SL}} quiz-input
```

This returns JSON with `config` (`rating`, `keep_sharp`), `target_questions`, `retests` (due misses from earlier weeks) and `fresh` (entries never tested). Each entry has `testable`, a `body` (the answer key, usually with a code snippet), `kind`, `skill`, `paths` and `commit`.

- If both lists are empty, say there is nothing to test yet and stop.
- **Include every due retest.** Then fill the rest up to `target_questions` with `fresh` entries, weighted toward the `keep_sharp` areas. If there are fewer than 10 entries in total, ask fewer questions. Never pad.
- Fresh entries you skip stay untested and roll into next week.

## 2. Build the questions (before asking the first one)

There is one question per entry. Pick the best type for each, in this priority order:

1. **explain-why** (from `decision` entries, and others where it fits): "Why did we choose X over Y? What breaks if we hadn't?" The entry's `testable` line is the starting point; you can sharpen it.
2. **predict-behavior:** show the snippet (or a trimmed piece of it) and ask what happens for a specific, concrete input or condition.
3. **find-the-bug:** take the snippet, reintroduce the logged bug from a `bug` entry, and ask the user to locate it and explain the failure. Don't mark the bug in any way, and don't let the change stand out visually.
4. **rewrite-from-spec:** "Without looking, write the signature and core logic of…". **At most one per test.**
5. **recall:** only when nothing better fits.

Calibrate to `config.rating`:

| Rating | Questions | Hints | What the grader expects |
|---|---|---|---|
| 1–3 | Fundamentals-heavy: what the code does and why it's needed | A short hint is offered up front with each question | The core idea plus the *why* |
| 4–7 | Balanced: why plus one consequence | A hint only if the user asks | The *why* plus at least one concrete consequence |
| 8–10 | Tradeoffs, failure modes, scale and concurrency edges | None | The *why*, the alternative rejected and when it would break |

Don't quote the answer key in the question. If a question needs file context beyond the stored snippet, use the snippet. Don't read the live files to build questions; they may have changed.

## 3. Ask one question at a time

Open with: `selflore test — N questions (R retests). Answer in your own words; "skip", "hint", or "unfair" are fine.`

For each question:

1. Show `Q<i>/<N> [<type> · <skill>]` followed by the question and any code. Retests are marked `(retest)`.
2. **Wait for the user's answer.** Never answer for them, and never move on without their answer.
3. Grade strictly against the entry body:
   - **got:** the core *why* is correct and nothing important is wrong. Describing *what* the code does without the *why* is not `got`.
   - **partial:** the right direction, but missing the key reason or consequence, or containing a significant error.
   - **missed:** wrong, empty, "I don't know" or "skip".
   Don't be generous. The user installed this to find gaps, and over-grading defeats it. When in doubt between two levels, choose the lower one.
4. **Explain immediately**, before the next question. Give the verdict, then the correct explanation in 2–5 sentences: what they got right, the gap and the real answer. For a miss, add the single sentence they should remember.
5. Record it:
   ```bash
   {{SL}} record --entry <id> --grade got|partial|missed --type explain-why|predict-behavior|find-the-bug|rewrite-from-spec|recall
   ```
   The CLI decides whether this was a retest and schedules misses and partials for +7 and +21 days. Retests retire after two consecutive passes.

Special replies:
- **"hint":** give one hint that does not reveal the answer, then wait. A correct answer after a hint can still be `got` for ratings of 7 or below. For ratings of 8 and above, it is at most `partial`.
- **"unfair"** (or the user says the question is wrong or irrelevant): don't argue. Run `{{SL}} suppress <id>`, don't record a grade and move on. If the question was flawed but the entry is fine, say so in one line.
- **"stop" / "later":** end the quiz early (step 4). Answers recorded so far still count.

## 4. Finish

```bash
{{SL}} finish-test
```

Then give a summary of at most 6 lines:
- The score (got / partial / missed) and how many retests were passed.
- The one or two misses most worth re-reading, by entry topic.
- When the next retest is due (from the `record` outputs).
- A pointer to `/selflore stats` for the trend.

No pep talk.
