import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { buildWebQuiz, finishTest, recordCmd, suppressCmd } from "./commands.js";
import { buildNotesData, renderNotesHtml } from "./notes-html.js";

export interface Req {
  method: string;
  url: string;
  host: string;
  token: string; // x-selflore-token header
  body: string;
}

export interface Res {
  status: number;
  type: string;
  body: string;
}

const json = (status: number, data: unknown): Res => ({ status, type: "application/json", body: JSON.stringify(data) });

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function parseBody(body: string): Record<string, unknown> {
  try {
    const v = JSON.parse(body || "{}");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The notes server's routes, without sockets. Only 127.0.0.1/localhost on our own port is served
 * (blocks DNS rebinding), and every /api call needs the per-run token from the opened URL.
 */
export function handle(req: Req, opts: { port: number; token: string; now?: Date }): Res {
  const now = opts.now ?? new Date();
  if (req.host !== `127.0.0.1:${opts.port}` && req.host !== `localhost:${opts.port}`) return json(403, { error: "bad host" });
  const path = req.url.split("?")[0];

  if (req.method === "GET" && path === "/")
    return { status: 200, type: "text/html; charset=utf-8", body: renderNotesHtml({ ...buildNotesData(now), server: true }) };
  if (!path.startsWith("/api/")) return json(404, { error: "not found" });
  if (!sameToken(req.token, opts.token)) return json(403, { error: "bad token" });

  if (req.method === "GET" && path === "/api/health") return json(200, { ok: true });
  if (req.method === "GET" && path === "/api/quiz") return json(200, { questions: buildWebQuiz(now) });

  const body = parseBody(req.body);
  const id = typeof body.entry_id === "string" ? body.entry_id : "";
  if (req.method === "POST" && path === "/api/answer") {
    const r = recordCmd(id, String(body.grade ?? ""), "recall", now, {
      source: "web",
      answer: typeof body.answer === "string" ? body.answer : undefined,
    });
    if (r.code !== 0) return json(400, { error: r.out });
    // Any answer counts as having tested this week, so a test left halfway still resets the nudge.
    finishTest(now);
    return json(200, { message: r.out });
  }
  if (req.method === "POST" && path === "/api/suppress") {
    const r = suppressCmd(id);
    return r.code === 0 ? json(200, { message: r.out }) : json(400, { error: r.out });
  }
  return json(404, { error: "not found" });
}

const MAX_BODY = 64 * 1024;

/** Wrap `handle` in an http server. `onRequest` lets the caller reset its idle timer. */
export function createNotesServer(opts: { token: string; onRequest?: () => void }): http.Server {
  const server = http.createServer((req, res) => {
    opts.onRequest?.();
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (c: string) => {
      body += c;
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on("end", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      let out: Res;
      try {
        out = handle(
          {
            method: req.method ?? "GET",
            url: req.url ?? "/",
            host: req.headers.host ?? "",
            token: String(req.headers["x-selflore-token"] ?? ""),
            body,
          },
          { port, token: opts.token },
        );
      } catch (err) {
        out = json(500, { error: err instanceof Error ? err.message : String(err) });
      }
      res.writeHead(out.status, { "content-type": out.type, "cache-control": "no-store" });
      res.end(out.body);
    });
  });
  return server;
}
