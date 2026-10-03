# Capturing an entry

## Format

Write one markdown entry with frontmatter and pipe it to `entry add`. `id`, `date`, `session`, `project` and `commit` are filled in automatically.

~~~bash
{{SL}} entry add --session <session_id> <<'LORE'
---
kind: bug                 # bug | decision | concept | pattern
skill: debugging          # debugging | architecture | fundamentals | <a keep_sharp stack name>
paths: ["src/payments/webhook.ts"]
testable: "Why must the Stripe webhook handler be idempotent, and what fails without it?"
---
Retries caused double refunds. In-memory dedupe fails across pods;
moved to a processed_events table keyed on event id.

```ts
export async function handleWebhook(evt: Stripe.Event) {
  const inserted = await db.processedEvents.insertIgnore({ id: evt.id });
  if (!inserted) return; // already handled
  await applyRefund(evt);
}
```
LORE
~~~

Run it from the project's working directory so `project` and `commit` are detected.

## Field rules

- **kind**
  - `bug`: something was root-caused and fixed.
  - `decision`: a tradeoff was made, either by you or after the user corrected you.
  - `concept`: an idea the user needs, such as how an API or library actually behaves.
  - `pattern`: a reusable structure that entered the codebase.
- **skill:** use the user's `keep_sharp` area that fits best. Use the stack name, such as `postgres`, when the lore is stack-specific.
- **paths:** the files involved, relative to the repo root.
- **testable:** a single question written *now*, while context is fresh. It should test understanding, not trivia:
  - Good: "Why X over Y?", "What breaks if…?", "What happens when the input is…?", "Where would this fail under concurrency?"
  - Bad: "What is the name of the function that…?", "Which file contains…?"
- **Body:** at most ~120 words of prose saying *what* happened and *why*, including the reason a tradeoff was made or what the root cause was. This is the answer key the grader uses later, so include the facts a correct answer must contain.
- **Snippet (strongly recommended):** one fenced code block of at most 40 lines with the essential code *as it is now*. The weekly test uses it for predict-behavior and find-the-bug questions, even after the file changes. For a `bug` entry, include the **fixed** code and name the original bug in the prose.

## Responses from `entry add`

- `logged <id> (n/cap this session)`: done. Tell the user in one line.
- `entry rejected: …`: fix the listed problems and retry once. If there is no good `testable` line, drop the entry.
- `cap reached` (exit code 2): compare the new moment against the listed entries using the user's `keep_sharp` areas. If the new one is clearly better, run:
  `{{SL}} entry replace <weaker-id> --session <session_id> <<'LORE' … LORE`
  Otherwise drop it silently.

## Choosing what to log when several triggers fired

Rank the candidates and keep the top ones up to the cap:
1. A match with the user's `keep_sharp` areas.
2. Bugs and corrected decisions. These are the moments the user is most likely to have missed.
3. Anything the user did not visibly read.

Prefer one deep entry over two shallow ones.
