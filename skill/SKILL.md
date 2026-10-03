---
name: selflore
description: Captures "lore-worthy" moments from Claude Code sessions and runs a weekly comprehension test on them so the developer keeps understanding code the agent wrote. Use it proactively, without being asked, right after any of these happen in a session - you wrote a function or module of ~30+ lines the user did not read or edit; a non-obvious tradeoff was made and a reason stated; a bug was root-caused and fixed; a new library, API or pattern entered the codebase; the user corrected you or you talked the user out of an approach. Also handles /selflore test, /selflore log, /selflore notes and /selflore stats, and the selflore Stop-hook nudge.
argument-hint: "test | log | notes | stats"
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
| `stats` | Run `{{SL}} stats` (add `--project <name>` if the user names one) and show the output verbatim in a code block. Add at most two sentences of interpretation. |
| none, or invoked by a capture trigger / Stop-hook nudge | Capture: follow the rules below and [references/capture.md](references/capture.md). |

## Capture rules (summary)

- **Triggers:** only the five in the description. Routine edits, renames, config tweaks and anything the user wrote themselves are not lore.
- **The `testable` line is the gate.** If you cannot write one sharp question that tests *understanding* (why / what breaks / what happens if), don't log it.
- **Cap:** at most `max_entries_per_session` per session (3–7, enforced by `entry add`). When the cap is hit, keep the entries that best match the user's `keep_sharp` areas, and replace a weaker one only if the new moment is clearly better.
- **Session id:** this comes from the session context line `selflore session_id=<id>`. If it is missing, use `manual-<YYYY-MM-DD>`.
- **Cost to the user:** near zero. Log quietly in one short tool call, then say a single line like `selflore: logged 1 entry (webhook idempotency)`. Never interrupt the user's task to discuss logging, and never ask permission to log.
- **Timing:** log when a unit of work wraps up (the bug is fixed, the module is written). Do not log mid-debugging.
- **Stop-hook nudge:** if a `selflore:` Stop-hook message says nothing was logged, either log up to the cap or reply with one line saying nothing was lore-worthy. Then stop.
