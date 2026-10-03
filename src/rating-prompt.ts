import { Prompt } from "@clack/core";
import { S_BAR, S_BAR_END, symbol } from "@clack/prompts";
import { styleText } from "node:util";

const MIN = 1;
const MAX = 10;

/** Horizontal 1–10 scale: ←/→ to move, digits jump (0 = 10), enter to confirm. */
class RatingPrompt extends Prompt<number> {
  constructor(opts: ConstructorParameters<typeof Prompt<number>>[0]) {
    super(opts, false);
    this.value = opts.initialValue ?? 5;
    this.on("cursor", (action) => {
      const v = this.value ?? 5;
      if (action === "left" || action === "down") this.value = Math.max(MIN, v - 1);
      if (action === "right" || action === "up") this.value = Math.min(MAX, v + 1);
    });
    this.on("key", (ch) => {
      if (ch && /^[0-9]$/.test(ch)) this.value = ch === "0" ? 10 : Number(ch);
    });
  }
}

export function renderScale(value: number): string {
  return Array.from({ length: MAX - MIN + 1 }, (_, i) => i + MIN)
    .map((n) => (n === value ? styleText(["green", "bold", "inverse"], ` ${n} `) : styleText("dim", ` ${n} `)))
    .join(" ");
}

export async function ratingPrompt(message: string, initialValue = 5): Promise<number | symbol> {
  return (await new RatingPrompt({
    initialValue,
    render() {
      const title = `${styleText("gray", S_BAR)}\n${symbol(this.state)}  ${message}\n`;
      const value = this.value ?? initialValue;
      switch (this.state) {
        case "submit":
          return `${title}${styleText("gray", S_BAR)}  ${styleText("dim", `${value}/10`)}`;
        case "cancel":
          return `${title}${styleText("gray", S_BAR)}  ${styleText(["strikethrough", "dim"], `${value}/10`)}\n${styleText("gray", S_BAR)}`;
        default:
          return [
            `${title}${styleText("cyan", S_BAR)}  ${renderScale(value)}`,
            `${styleText("cyan", S_BAR)}  ${styleText("dim", "← → to change · enter to confirm")}`,
            `${styleText("cyan", S_BAR_END)}\n`,
          ].join("\n");
      }
    },
  }).prompt()) as number | symbol;
}
