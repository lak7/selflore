---
name: selflore
description: Captures "lore" from Claude Code sessions (what the agent did for the developer) and runs a weekly comprehension test on it, so the developer keeps understanding code the agent wrote. Handles /selflore test, /selflore log, /selflore notes, /selflore stats and /selflore focus, and selflore hints that appear in the session context. Capture normally happens automatically in the background; check the session context line "selflore capture=<mode>" before logging anything yourself.
argument-hint: "test | log | notes | stats | focus"
---

# selflore

selflore captures what you (the agent) did *for* the user, then tests them on it weekly. Getting it wrong is the feature: a miss followed by an immediate explanation is the strongest learning moment.

All bookkeeping goes through the data CLI. Never edit `~/.selflore/` files by hand.

```
SL = {{SL}}
```

## Routing

Look at the arguments the skill was invoked with:

| Argument | Do this |
|---|---|
| `test` | Read [references/test.md](references/test.md) and run the weekly test. |
| `log` | Read [references/log.md](references/log.md) and write a manual entry. |
| `notes` | Run `{{SL}} notes` (add `--all` or `--project <name>` if the user asks). It opens the notes page in the browser. Reply with one line: that it opened, or the `file://` path if it couldn't open. Don't repeat the entries in chat. |
| `focus` | Run `{{SL}} focus <arguments>` and show the output verbatim. |
| `stats` | Run `{{SL}} stats` (add `--project <name>` if the user names one) and show the output verbatim in a code block. Add at most two sentences of interpretation. |
| none, or a `selflore:` hint in quiet mode | Capture: follow the rules below and [references/capture.md](references/capture.md). |

## Capture mode

The session context has a line `selflore capture=<mode>`:
- **background** (default): selflore captures automatically after turns, outside this session. **Don't log entries yourself.** Only log when the user runs `/selflore log`.
- **quiet**: you may receive a `selflore:` hint along with a user prompt. Act on it only at a natural pause in the task, after doing what the user asked. Never block or delay their work for it.
- **off**: log only when the user runs `/selflore log`.

## Focus

Run `{{SL}} focus` to see the effective focus for this project: details, design or mixed (with a balance). A project override beats the global setting.
- **details:** language, library and API specifics. How things behave, edge cases, gotchas.
- **design:** architecture, data flow, tradeoffs, failure modes, scale.
- **mixed:** both. Tag each entry honestly and lean toward the chosen balance.

`/selflore focus …` passes its arguments straight to `{{SL}} focus …` (e.g. `/selflore focus details --project`). Show the output as-is.

## Capture rules (when you do log)

- **The `testable` line is the gate.** If you can't write one sharp question that tests *understanding* (why / what breaks / what happens if / what does this print and why), don't log it.
- **There's no cap.** Log each real unit of work once. `entry add` merges near-duplicates into the existing untested entry automatically.
- **Session id:** this comes from the session context line `selflore session_id=<id>`. If it's missing, use `manual-<YYYY-MM-DD>`.
- **Cost to the user:** near zero. Log quietly in one short tool call, then say a single line like `selflore: logged 1 entry (webhook idempotency)`. Never ask permission to log.
