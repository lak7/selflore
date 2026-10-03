# selflore

**Own what your agent builds.**

selflore is a Claude Code skill. It captures the moments where Claude did real work *for* you (a bug root-caused, a tradeoff made, a 40-line module you never read), then tests you on them once a week. Misses come back at +7 and +21 days until they stick. Getting it wrong is the feature.

## Install

```bash
npx selflore init
```

Four questions: a self-rating from 1 to 10, what you want to keep sharp, how many entries to capture per session (3–7), and whether you want a nudge when a test is overdue. Re-run `init` at any time to change your answers. Your data is kept. Restart any open Claude Code sessions afterwards.

## Use

Work normally. When something lore-worthy happens, Claude logs an entry with a one-line note. At most `max_entries_per_session` entries are logged per session.

| Command | What it does |
|---|---|
| `/selflore test` | Weekly quiz, about 10 questions and about 20 minutes. Each answer is graded immediately as got it, partial or missed, with an explanation. Say `unfair` to drop a question for good. |
| `/selflore log` | Log the current thing manually. Also covers work done outside Claude Code. |
| `/selflore stats` | Weekly table: entries, questions, pass rate overall and by skill, retest backlog, and self-rating vs. observed pass rate. |

## Remove

```bash
npx selflore remove           # remove skill + hooks, keep data
npx selflore remove --purge   # remove everything
```

## How it works

- **Skill** at `~/.claude/skills/selflore/`. Claude writes entries, builds quizzes and grades answers.
- **Hooks** are merged into `~/.claude/settings.json`; existing hooks are never touched, and a backup is written to `settings.json.selflore-bak`.
  - `SessionStart` gives Claude the session id and, if enabled, a one-line reminder when a test is overdue.
  - `Stop` is a safety net. If the session had a large write, a dependency change or a fail → fix → pass loop and nothing was logged, it nudges once per session.
- **Data** lives globally in `~/.selflore/`, because learning spans projects:

```
~/.selflore/
  config.json        rating, keep_sharp, max_entries_per_session, nudge, cadence, last_test_at
  entries/           YYYY-MM-DD-slug.md   (frontmatter + ≤120 words + an optional code snippet)
  results.jsonl      one line per graded answer
  queue.json         retest due dates
  state/             per-session capture counters
  app/               the runtime the hooks call
```

Each entry stores the `testable` question written at capture time, while context is fresh. It also stores a code snippet and the commit SHA, so quiz questions still work after the code moves on.

## Develop

```bash
npm install
npm run build
npm test
SELFLORE_HOME=/tmp/sl CLAUDE_HOME=/tmp/cl node dist/cli.js init --yes   # sandboxed install
```

MIT
