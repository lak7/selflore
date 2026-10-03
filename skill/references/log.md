# /selflore log — manual entry

The user said "this was important". It is also the escape hatch for work done outside Claude Code.

1. Work out what they mean from the current conversation. If the conversation has no such context (for example, the work happened in Cursor or Codex), ask for a 2–3 sentence description and any code worth keeping.
2. Write the entry exactly as described in [capture.md](capture.md). The same quality bar applies: a real `testable` line and a body that works as an answer key.
3. Store it with the `--manual` flag. Manual entries may exceed the session cap; the CLI warns instead of refusing:
   ```bash
   {{SL}} entry add --session <session_id> --manual <<'LORE'
   …
   LORE
   ```
4. Show the user the `testable` question you wrote, in one line, so they can ask you to sharpen it.
