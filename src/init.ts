import * as p from "@clack/prompts";
import { clampCap, configExists, DEFAULT_CONFIG, readConfig, writeConfig, type Config } from "./lib/config.js";
import { installFiles } from "./lib/install.js";
import { paths } from "./lib/paths.js";
import { ratingPrompt } from "./rating-prompt.js";

const BUILTIN_SHARP = ["debugging", "architecture", "fundamentals"];

function bail<T>(v: T): Exclude<T, symbol> {
  if (p.isCancel(v)) {
    p.cancel("selflore init cancelled; nothing changed.");
    process.exit(1);
  }
  return v as Exclude<T, symbol>;
}

async function ask(existing: Config, reinstall: boolean): Promise<Config> {
  // Starts on 5 (or the previous answer on re-run).
  const rating = bail(await ratingPrompt("Rate yourself as a software engineer, 1–10.", existing.rating));

  const prevStack = existing.keep_sharp.filter((k) => !BUILTIN_SHARP.includes(k));
  const sharp = bail(
    await p.multiselect({
      message: "What do you most want to keep sharp? (pick one or more: space to select, enter to confirm)",
      options: [
        { value: "debugging", label: "Debugging" },
        { value: "architecture", label: "Architecture & tradeoffs" },
        { value: "fundamentals", label: "Language & framework fundamentals" },
        { value: "__stack", label: "A named stack", hint: "you'll type it next" },
      ],
      // Nothing pre-ticked on a fresh install, so enter alone can't silently submit a default.
      initialValues: reinstall
        ? [...existing.keep_sharp.filter((k) => BUILTIN_SHARP.includes(k)), ...(prevStack.length ? ["__stack"] : [])]
        : [],
      required: true,
    }),
  );
  const keep_sharp = sharp.filter((s) => s !== "__stack");
  if (sharp.includes("__stack")) {
    const stack = bail(
      await p.text({
        message: "Which stack? (comma-separated, e.g. postgres, react)",
        initialValue: prevStack.join(", "),
        validate: (v) => ((v ?? "").trim() ? undefined : "Name at least one"),
      }),
    );
    keep_sharp.push(...stack.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  }

  const cap = bail(
    await p.select({
      message: "How much should Claude capture per session?",
      options: [3, 4, 5, 6, 7].map((n) => ({ value: n, label: `${n} entries`, hint: n === 3 ? "default" : undefined })),
      initialValue: existing.max_entries_per_session,
    }),
  );

  const nudge = bail(
    await p.select({
      message: "How pushy should selflore be?",
      options: [
        { value: false, label: "Quiz only" },
        { value: true, label: "Quiz + a nudge when a test is overdue" },
      ],
      initialValue: existing.nudge,
    }),
  );

  return {
    ...existing,
    rating,
    keep_sharp,
    max_entries_per_session: clampCap(cap),
    nudge,
  };
}

export async function init(opts: { yes: boolean }): Promise<void> {
  const reinstall = configExists();
  const existing = reinstall ? readConfig() : DEFAULT_CONFIG;

  if (opts.yes || !process.stdin.isTTY) {
    writeConfig(existing);
    installFiles();
    console.log(`selflore installed (${reinstall ? "kept existing config" : "default config"}) → ${paths.config()}`);
    return;
  }

  p.intro("selflore — own what your agent builds");
  if (reinstall) p.log.info("Existing config found; your previous answers are pre-filled. Data is kept.");
  const config = await ask(existing, reinstall);
  writeConfig(config);
  installFiles();
  p.note(
    [
      `config   ${paths.config()}`,
      `skill    ${paths.skill()}`,
      `hooks    SessionStart + Stop in ${paths.settings()}`,
      "",
      "Work normally. Claude logs lore-worthy moments as they happen.",
      "Once a week, run /selflore test (~20 min). /selflore stats shows the trend.",
      "Restart any open Claude Code sessions to pick up the skill and hooks.",
    ].join("\n"),
    "Installed",
  );
  p.outro("Getting it wrong is the feature.");
}
