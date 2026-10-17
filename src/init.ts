import * as p from "@clack/prompts";
import {
  configExists,
  DEFAULT_CONFIG,
  readConfig,
  writeConfig,
  type Balance,
  type CaptureMode,
  type CaptureModel,
  type Config,
  type FocusMode,
  type Intensity,
} from "./lib/config.js";
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

  const capture_intensity = bail(
    await p.select<Intensity>({
      message: "Capture intensity: how much should count as worth capturing?",
      options: [
        { value: "light", label: "Light", hint: "only the big moments: major bugs and design decisions" },
        { value: "normal", label: "Normal", hint: "every real unit of work: bugs, tradeoffs, new APIs, unread modules" },
        { value: "thorough", label: "Thorough", hint: "smaller gotchas and edge cases too" },
      ],
      initialValue: existing.capture_intensity,
    }),
  );

  const mode = bail(
    await p.select<FocusMode>({
      message: "What should selflore capture? (you can override this per project later)",
      options: [
        { value: "details", label: "Details", hint: "language & library specifics, edge cases, gotchas" },
        { value: "design", label: "Design", hint: "architecture, tradeoffs, failure modes" },
        { value: "mixed", label: "Mixed", hint: "both; you choose the balance next" },
      ],
      initialValue: existing.focus.mode,
    }),
  );
  let balance: Balance = existing.focus.balance;
  if (mode === "mixed") {
    balance = bail(
      await p.select<Balance>({
        message: "Mixed: what balance?",
        options: [
          { value: "design", label: "Mostly design", hint: "~70% design, 30% details" },
          { value: "balanced", label: "Balanced", hint: "50/50" },
          { value: "details", label: "Mostly details", hint: "~70% details, 30% design" },
        ],
        initialValue: existing.focus.balance,
      }),
    );
  }

  const capture = bail(
    await p.select<CaptureMode>({
      message: "How should capture happen?",
      options: [
        { value: "background", label: "In the background", hint: "recommended; never interrupts, runs a separate Claude call" },
        { value: "quiet", label: "Quiet hint", hint: "Claude logs at a natural pause in your session; no extra calls" },
        { value: "off", label: "Off", hint: "only when you run /selflore log" },
      ],
      initialValue: existing.capture,
    }),
  );

  let capture_model: CaptureModel = existing.capture_model;
  if (capture === "background") {
    capture_model = bail(
      await p.select<CaptureModel>({
        message: "Which model should background capture use?",
        options: [
          { value: "session", label: "Same as the session", hint: "default" },
          { value: "sonnet", label: "Sonnet", hint: "sharp questions, moderate cost" },
          { value: "haiku", label: "Haiku", hint: "cheapest and fastest" },
        ],
        initialValue: existing.capture_model,
      }),
    );
  }

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
    capture_intensity,
    focus: { mode, balance },
    capture,
    capture_model,
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
      `hooks    SessionStart + Stop + UserPromptSubmit in ${paths.settings()}`,
      "",
      "Work normally. selflore never interrupts; lore is captured as you go.",
      "Per-project focus: run `selflore focus details --project` inside a repo.",
      "Once a week, run /selflore test (~20 min). /selflore stats shows the trend.",
      "Restart any open Claude Code sessions to pick up the skill and hooks.",
    ].join("\n"),
    "Installed",
  );
  p.outro("Getting it wrong is the feature.");
}
