import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paths, selfloreHome } from "./paths.js";
import { installHooks, uninstallHooks } from "./settings.js";

/** Package root (contains dist/ and skill/), resolved from this compiled file at dist/lib/install.js. */
export function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function copyDir(src: string, dest: string, transform?: (file: string, text: string) => string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDir(from, to, transform);
    else if (transform && name.endsWith(".md")) fs.writeFileSync(to, transform(from, fs.readFileSync(from, "utf8")));
    else fs.copyFileSync(from, to);
  }
}

export function slCommand(): string {
  return `node "${path.join(paths.app(), "sl.js")}"`;
}

/** Copy the runtime and skill into place and merge hooks. Safe to re-run (upgrades in place). */
export function installFiles(root = packageRoot()): void {
  fs.mkdirSync(paths.entries(), { recursive: true });
  fs.mkdirSync(paths.state(), { recursive: true });

  // Runtime: a self-contained copy so hooks never depend on the npx cache.
  fs.rmSync(paths.app(), { recursive: true, force: true });
  copyDir(path.join(root, "dist"), paths.app());
  fs.writeFileSync(path.join(paths.app(), "package.json"), JSON.stringify({ type: "module", private: true }) + "\n");

  // Skill: templated with the real sl path so SELFLORE_HOME overrides keep working.
  fs.rmSync(paths.skill(), { recursive: true, force: true });
  copyDir(path.join(root, "skill"), paths.skill(), (_f, text) => text.replaceAll("{{SL}}", slCommand()));

  installHooks();
}

export function removeFiles(purge: boolean): void {
  uninstallHooks();
  fs.rmSync(paths.skill(), { recursive: true, force: true });
  if (purge) fs.rmSync(selfloreHome(), { recursive: true, force: true });
  else {
    fs.rmSync(paths.app(), { recursive: true, force: true });
    fs.rmSync(paths.state(), { recursive: true, force: true });
  }
}
