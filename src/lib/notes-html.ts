import { readConfig } from "./config.js";
import { listEntries, splitBody, type Entry } from "./entries.js";
import { entryStatus, weekStart, type EntryStatus } from "./notes.js";
import { readQueue, type Queue } from "./queue.js";
import { readResults, testedEntryIds } from "./results.js";

export interface NoteCard {
  id: string;
  date: string;
  project: string;
  kind: string;
  skill: string;
  paths: string[];
  commit: string;
  testable: string;
  prose: string;
  snippet: string | null;
  snippetLang: string;
  status: EntryStatus;
  retest_due: string | null;
}

export interface NotesData {
  generated_at: string;
  week_start: string;
  rating: number;
  keep_sharp: string[];
  entries: NoteCard[];
  initial?: { all: boolean; project: string | null };
}

export function toCard(e: Entry, tested: Set<string>, queue: Queue): NoteCard {
  const { prose, snippet } = splitBody(e.body);
  return {
    id: e.id,
    date: e.date,
    project: e.project,
    kind: e.kind,
    skill: e.skill,
    paths: e.paths,
    commit: e.commit,
    testable: e.testable,
    prose,
    snippet: snippet ? snippet.replace(/\s+$/, "") : null,
    snippetLang: e.body.match(/```([\w+-]+)/)?.[1] ?? "",
    ...entryStatus(e, tested, queue),
  };
}

export function buildNotesData(now = new Date()): NotesData {
  const config = readConfig();
  const tested = testedEntryIds(readResults());
  const queue = readQueue();
  return {
    generated_at: now.toISOString(),
    week_start: weekStart(now),
    rating: config.rating,
    keep_sharp: config.keep_sharp,
    entries: listEntries().map((e) => toCard(e, tested, queue)),
  };
}

/** JSON safe to embed in a <script> element: no "<" can close the tag early. */
export function embedJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

const CSS = String.raw`
:root {
  --bg: #f7f6f3; --surface: #ffffff; --surface-2: #f1efea; --text: #1c1a17; --muted: #6f6a62; --faint: #a39e95;
  --border: #e5e2db; --accent: #4f46e5; --accent-soft: #eef0ff; --code-bg: #f6f5f1;
  --bug: #c2410c; --decision: #6d28d9; --concept: #0f766e; --pattern: #a16207;
  --ok: #15803d; --warn: #b45309;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f0f10; --surface: #18181b; --surface-2: #1f1f23; --text: #f2f1ee; --muted: #a3a09a; --faint: #6b6862;
    --border: #2a2a2f; --accent: #a5b4fc; --accent-soft: #1e1f3a; --code-bg: #121214;
    --bug: #fb923c; --decision: #c4b5fd; --concept: #5eead4; --pattern: #fcd34d;
    --ok: #4ade80; --warn: #fbbf24;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--bg); color: var(--text);
  font: 15px/1.55 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 880px; margin: 0 auto; padding: 40px 16px 80px; }
header.top { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 28px; }
.brand { display: flex; align-items: center; gap: 12px; }
.mark { width: 36px; height: 36px; border-radius: 10px; background: var(--accent); display: grid; place-items: center; color: var(--surface); font-weight: 700; font-size: 18px; }
.brand h1 { font-size: 22px; letter-spacing: -0.02em; margin: 0; line-height: 1.1; }
.brand p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
.weeknav { display: flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 4px; }
.weeknav button { border: 0; background: transparent; color: var(--text); font: inherit; padding: 6px 10px; border-radius: 8px; cursor: pointer; }
.weeknav button:hover:not(:disabled) { background: var(--surface-2); }
.weeknav button:disabled { color: var(--faint); cursor: default; }
.weeknav .label { min-width: 150px; text-align: center; font-weight: 600; font-size: 14px; }
.weeknav .alltime[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; }
.tile .n { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; font-variant-numeric: tabular-nums; }
.tile .l { color: var(--muted); font-size: 12.5px; margin-top: 2px; }
.sharp { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; color: var(--muted); font-size: 12.5px; margin-bottom: 26px; }
.pill { border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; background: var(--surface); color: var(--text); font-size: 12.5px; }
.filters { padding: 0 0 14px; margin-bottom: 8px; border-bottom: 1px solid var(--border); }
.search { width: 100%; font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; outline: none; }
.search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.chiprows { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.chiprow { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.chiprow .k { color: var(--faint); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; width: 62px; flex-shrink: 0; }
.chip { font: inherit; font-size: 12.5px; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 999px; padding: 3px 10px; cursor: pointer; }
.chip:hover { border-color: var(--faint); }
.chip[aria-pressed="true"] { background: var(--text); color: var(--bg); border-color: var(--text); }
.day { margin-top: 30px; }
.day h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 0 0 10px; display: flex; gap: 8px; align-items: baseline; }
.day h2 .c { color: var(--faint); font-weight: 500; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px 20px; margin-bottom: 12px; border-left: 4px solid var(--kind, var(--border)); }
.card.suppressed { opacity: 0.6; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.badge { font-size: 11.5px; font-weight: 600; letter-spacing: 0.02em; border-radius: 6px; padding: 2px 8px; }
.kind { color: var(--kind); background: color-mix(in srgb, var(--kind) 12%, transparent); text-transform: capitalize; }
.skill { color: var(--muted); background: var(--surface-2); font-weight: 500; }
.status { margin-left: auto; border: 1px solid var(--border); color: var(--muted); font-weight: 500; }
.status.tested { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 35%, transparent); }
.status.retest { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, transparent); }
.status.suppressed { text-decoration: line-through; }
.q { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.4; margin: 12px 0 8px; }
.meta { color: var(--muted); font-size: 12.5px; display: flex; flex-wrap: wrap; gap: 4px 10px; }
.meta code { font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--surface-2); padding: 1px 6px; border-radius: 5px; color: var(--text); }
details { margin-top: 14px; }
summary { list-style: none; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--accent); padding: 6px 12px; border-radius: 8px; background: var(--accent-soft); user-select: none; }
summary::-webkit-details-marker { display: none; }
summary::before { content: "▸"; transition: transform 0.15s; }
details[open] summary::before { transform: rotate(90deg); }
details[open] summary .show { display: none; }
details:not([open]) summary .hide { display: none; }
.answer { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border); }
.answer p { margin: 0 0 10px; }
.code { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-top: 6px; background: var(--code-bg); }
.codebar { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; border-bottom: 1px solid var(--border); font-size: 11.5px; color: var(--muted); }
.copy { font: inherit; border: 1px solid var(--border); background: var(--surface); color: var(--text); padding: 2px 8px; border-radius: 6px; cursor: pointer; }
pre { margin: 0; padding: 12px 0; overflow-x: auto; font: 12.5px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; counter-reset: ln; }
pre .ln { display: block; padding: 0 14px 0 0; white-space: pre; }
pre .ln::before { counter-increment: ln; content: counter(ln); display: inline-block; width: 3em; padding-right: 1em; text-align: right; color: var(--faint); user-select: none; }
.empty { text-align: center; color: var(--muted); padding: 60px 16px; border: 1px dashed var(--border); border-radius: 16px; margin-top: 24px; background: var(--surface); }
.empty strong { display: block; color: var(--text); font-size: 16px; margin-bottom: 4px; }
.empty button { margin-top: 12px; }
footer { margin-top: 48px; color: var(--faint); font-size: 12px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
kbd { font: 11px ui-monospace, Menlo, monospace; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 4px; padding: 0 5px; color: var(--muted); background: var(--surface); }
@media (max-width: 640px) {
  .wrap { padding-top: 24px; }
  .tiles { grid-template-columns: repeat(2, 1fr); }
  .weeknav { width: 100%; justify-content: space-between; }
  .weeknav .label { min-width: 0; }
  .q { font-size: 16.5px; }
  .card { padding: 16px; }
  .chiprow .k { width: 100%; }
}
`;

// Client script. Plain ES2017, no template literals, so it embeds cleanly. All entry text goes through textContent.
const JS = String.raw`
(function () {
  var DATA = JSON.parse(document.getElementById("selflore-data").textContent);
  var NOW = new Date();
  var KIND_VAR = { bug: "--bug", decision: "--decision", concept: "--concept", pattern: "--pattern" };
  var STATUS_LABEL = { untested: "Untested", tested: "Tested", suppressed: "Suppressed" };

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parse(s) { var p = s.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function iso(d) { return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function monday(s) { var d = parse(s); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); }
  function addDays(s, n) { var d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function fmt(s, opts) { return parse(s).toLocaleDateString(undefined, Object.assign({ timeZone: "UTC" }, opts)); }

  var init = DATA.initial || {};
  var state = { week: DATA.week_start, all: !!init.all, project: init.project || null, skill: null, kind: null, status: null, q: "" };
  (location.hash.slice(1) || "").split("&").forEach(function (kv) {
    var p = kv.split("="); var k = decodeURIComponent(p[0] || ""); var v = p[1] ? decodeURIComponent(p[1]) : "";
    if (k === "all") state.all = true;
    else if (k === "week" && /^\d{4}-\d{2}-\d{2}$/.test(v)) state.week = monday(v);
    else if (["project", "skill", "kind", "status"].indexOf(k) >= 0 && v) state[k] = v;
  });
  var earliest = DATA.entries.reduce(function (m, e) { var w = monday(e.date); return w < m ? w : m; }, DATA.week_start);

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") el.textContent = attrs[k];
      else if (k === "class") el.className = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c != null) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    return el;
  }

  function inScope(e) { return state.all || monday(e.date) === state.week; }
  function matches(e, skip) {
    if (skip !== "project" && state.project && e.project !== state.project) return false;
    if (skip !== "skill" && state.skill && e.skill !== state.skill) return false;
    if (skip !== "kind" && state.kind && e.kind !== state.kind) return false;
    if (skip !== "status" && state.status && e.status !== state.status) return false;
    if (state.q) {
      var hay = (e.testable + " " + e.paths.join(" ") + " " + e.project + " " + e.skill).toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
    }
    return true;
  }

  function statusText(e) {
    if (e.status !== "retest") return STATUS_LABEL[e.status];
    if (e.retest_due && new Date(e.retest_due) <= NOW) return "Retest due";
    return "Retest " + (e.retest_due ? new Date(e.retest_due).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
  }

  function renderNav() {
    var label = document.getElementById("weeklabel");
    label.textContent = state.all ? "Since " + fmt(earliest, { month: "short", day: "numeric" }) : (state.week === DATA.week_start ? "This week · " : "Week of ") + fmt(state.week, { month: "short", day: "numeric" });
    document.getElementById("prev").disabled = state.all || state.week <= earliest;
    document.getElementById("next").disabled = state.all || state.week >= DATA.week_start;
    document.getElementById("alltime").setAttribute("aria-pressed", String(state.all));
  }

  function renderTiles(scope) {
    var due = scope.filter(function (e) { return e.status === "retest" && e.retest_due && new Date(e.retest_due) <= NOW; }).length;
    var tiles = [
      [scope.length, state.all ? "Entries captured" : "Captured this week"],
      [scope.filter(function (e) { return e.status === "untested"; }).length, "Untested"],
      [scope.filter(function (e) { return e.status === "retest"; }).length, due ? "In retest queue · " + due + " due" : "In retest queue"],
      [scope.filter(function (e) { return e.status === "tested"; }).length, "Tested & solid"],
    ];
    var el = document.getElementById("tiles"); el.textContent = "";
    tiles.forEach(function (t) { el.appendChild(h("div", { class: "tile" }, h("div", { class: "n", text: String(t[0]) }), h("div", { class: "l", text: t[1] }))); });
  }

  function chipRow(key, label, scope, labeler) {
    var values = {};
    scope.filter(function (e) { return matches(e, key); }).forEach(function (e) { var v = e[key]; if (v) values[v] = (values[v] || 0) + 1; });
    if (state[key] && !values[state[key]]) values[state[key]] = 0;
    var keys = Object.keys(values).sort();
    if (keys.length < 2 && !state[key]) return null;
    var row = h("div", { class: "chiprow" }, h("span", { class: "k", text: label }));
    row.appendChild(h("button", { class: "chip", "aria-pressed": String(!state[key]), onclick: function () { state[key] = null; render(); }, text: "All" }));
    keys.forEach(function (v) {
      row.appendChild(h("button", {
        class: "chip", "aria-pressed": String(state[key] === v),
        onclick: function () { state[key] = state[key] === v ? null : v; render(); },
        text: (labeler ? labeler(v) : v) + " · " + values[v],
      }));
    });
    return row;
  }

  function renderChips(scope) {
    var el = document.getElementById("chips"); el.textContent = "";
    [chipRow("project", "Project", scope), chipRow("skill", "Skill", scope),
     chipRow("kind", "Kind", scope, function (v) { return v.charAt(0).toUpperCase() + v.slice(1); }),
     chipRow("status", "Status", scope, function (v) { return v === "retest" ? "Retest" : STATUS_LABEL[v]; })]
      .forEach(function (r) { if (r) el.appendChild(r); });
  }

  function codeBlock(e) {
    var pre = h("pre");
    e.snippet.split("\n").forEach(function (line) { pre.appendChild(h("span", { class: "ln", text: line || " " })); });
    var copy = h("button", { class: "copy", text: "Copy", onclick: function () {
      (navigator.clipboard ? navigator.clipboard.writeText(e.snippet) : Promise.reject()).then(
        function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy"; }, 1200); },
        function () { copy.textContent = "Select & copy"; });
    } });
    var lines = e.snippet.split("\n").length;
    var info = [e.snippetLang, lines + (lines === 1 ? " line" : " lines"), e.commit ? "@ " + e.commit : ""].filter(Boolean).join(" · ");
    return h("div", { class: "code" }, h("div", { class: "codebar" }, h("span", { text: info }), copy), pre);
  }

  function card(e) {
    var c = h("article", { class: "card" + (e.status === "suppressed" ? " suppressed" : ""), id: e.id });
    c.style.setProperty("--kind", "var(" + (KIND_VAR[e.kind] || "--border") + ")");
    c.appendChild(h("div", { class: "row" },
      h("span", { class: "badge kind", text: e.kind }),
      h("span", { class: "badge skill", text: e.skill }),
      h("span", { class: "badge status " + e.status, text: statusText(e) })));
    c.appendChild(h("div", { class: "q", text: e.testable }));
    var meta = h("div", { class: "meta" });
    if (e.project) meta.appendChild(h("span", { text: e.project }));
    e.paths.forEach(function (p) { meta.appendChild(h("code", { text: p })); });
    c.appendChild(meta);
    var answer = h("div", { class: "answer" });
    e.prose.split(/\n\s*\n/).forEach(function (para) { if (para.trim()) answer.appendChild(h("p", { text: para.replace(/\s*\n\s*/g, " ").trim() })); });
    if (e.snippet) answer.appendChild(codeBlock(e));
    c.appendChild(h("details", null,
      h("summary", null, h("span", { class: "show", text: "Show answer" }), h("span", { class: "hide", text: "Hide answer" })),
      answer));
    return c;
  }

  function renderList(scope) {
    var list = document.getElementById("list"); list.textContent = "";
    var shown = scope.filter(function (e) { return matches(e); });
    if (DATA.entries.length === 0) {
      list.appendChild(h("div", { class: "empty" }, h("strong", { text: "Nothing captured yet" }), "Work normally in Claude Code. Lore-worthy moments land here as they happen."));
      return;
    }
    if (shown.length === 0) {
      var filtered = state.project || state.skill || state.kind || state.status || state.q;
      list.appendChild(h("div", { class: "empty" },
        h("strong", { text: filtered ? "No entries match these filters" : "Nothing captured this week" }),
        filtered ? null : "Try another week or switch to All time.",
        filtered ? h("button", { class: "chip", text: "Clear filters", onclick: function () {
          state.project = state.skill = state.kind = state.status = null; state.q = ""; document.getElementById("search").value = ""; render();
        } }) : null));
      return;
    }
    var days = {};
    shown.forEach(function (e) { (days[e.date] = days[e.date] || []).push(e); });
    Object.keys(days).sort().reverse().forEach(function (d) {
      var sec = h("section", { class: "day" }, h("h2", null, fmt(d, { weekday: "long", month: "short", day: "numeric" }), h("span", { class: "c", text: String(days[d].length) })));
      days[d].sort(function (a, b) { return a.id < b.id ? -1 : 1; }).forEach(function (e) { sec.appendChild(card(e)); });
      list.appendChild(sec);
    });
  }

  function syncHash() {
    var parts = [];
    if (state.all) parts.push("all"); else if (state.week !== DATA.week_start) parts.push("week=" + state.week);
    ["project", "skill", "kind", "status"].forEach(function (k) { if (state[k]) parts.push(k + "=" + encodeURIComponent(state[k])); });
    history.replaceState(null, "", parts.length ? "#" + parts.join("&") : location.pathname);
  }

  function render() {
    var scope = DATA.entries.filter(inScope);
    renderNav(); renderTiles(scope); renderChips(scope); renderList(scope); syncHash();
  }

  document.getElementById("prev").onclick = function () { state.week = addDays(state.week, -7); render(); };
  document.getElementById("next").onclick = function () { state.week = addDays(state.week, 7); render(); };
  document.getElementById("alltime").onclick = function () { state.all = !state.all; render(); };
  var search = document.getElementById("search");
  search.addEventListener("input", function () { state.q = search.value.trim(); render(); });

  var sharp = document.getElementById("sharp");
  if (DATA.keep_sharp.length) {
    sharp.appendChild(document.createTextNode("Keeping sharp:"));
    DATA.keep_sharp.forEach(function (k) { sharp.appendChild(h("span", { class: "pill", text: k })); });
    sharp.appendChild(document.createTextNode("· self-rating " + DATA.rating + "/10"));
  }
  document.getElementById("generated").textContent = "Generated " + new Date(DATA.generated_at).toLocaleString();

  document.addEventListener("keydown", function (ev) {
    if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA") ) {
      if (ev.key === "Escape") ev.target.blur();
      return;
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "/") { ev.preventDefault(); search.focus(); }
    else if (ev.key === "a") {
      var all = Array.prototype.slice.call(document.querySelectorAll("#list details"));
      var open = all.some(function (d) { return !d.open; });
      all.forEach(function (d) { d.open = open; });
    }
    else if (ev.key === "ArrowLeft" && !document.getElementById("prev").disabled) document.getElementById("prev").click();
    else if (ev.key === "ArrowRight" && !document.getElementById("next").disabled) document.getElementById("next").click();
  });

  render();
})();
`;

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#4f46e5"/><text x="16" y="22" font-family="system-ui,sans-serif" font-size="18" font-weight="700" text-anchor="middle" fill="#fff">s</text></svg>',
  );

export function renderNotesHtml(data: NotesData): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>selflore notes</title>
<link rel="icon" href="${FAVICON}">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="brand">
      <div class="mark" aria-hidden="true">s</div>
      <div><h1>selflore</h1><p>What your agent built for you, and what you should own.</p></div>
    </div>
    <nav class="weeknav" aria-label="Week">
      <button id="prev" aria-label="Previous week">‹</button>
      <span class="label" id="weeklabel"></span>
      <button id="next" aria-label="Next week">›</button>
      <button id="alltime" class="alltime" aria-pressed="false">All time</button>
    </nav>
  </header>
  <section class="tiles" id="tiles" aria-label="Summary"></section>
  <div class="sharp" id="sharp"></div>
  <div class="filters">
    <input id="search" class="search" type="search" placeholder="Search questions, files, projects…  ( / )" autocomplete="off">
    <div class="chiprows" id="chips"></div>
  </div>
  <main id="list"></main>
  <footer>
    <span id="generated"></span>
    <span><kbd>a</kbd> reveal all · <kbd>←</kbd><kbd>→</kbd> weeks · <kbd>/</kbd> search · run <code>/selflore test</code> in Claude Code to be quizzed</span>
  </footer>
</div>
<script type="application/json" id="selflore-data">${embedJson(data)}</script>
<script>${JS}</script>
</body>
</html>
`;
}
