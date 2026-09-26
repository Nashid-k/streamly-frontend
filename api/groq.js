// api/groq.js - serverless Groq proxy. Groq key stays SERVER-side (git-ignored
// api/groq.key.js local fallback + process.env.GROQ_API_KEY for Vercel), never
// ships in the bundle. Same same-origin pattern as api/tmdb.js: the Vite dev
// middleware + vercel rewrites route /api/groq to this function.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { withLog } from "../server/logger.js";
import { rateLimit, tooManyRequests, clientIp } from "../server/rateLimit.js";

const GROQ_BASE = "https://api.groq.com/openai/v1";

function loadKey() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY.trim();
  for (const name of ["api/groq.key.js", "groq.key.js"]) {
    const p = path.resolve(name);
    if (existsSync(p)) {
      try {
        const s = readFileSync(p, "utf8");
        const m = s.match(/gsk_[A-Za-z0-9_-]{20,}/);
        if (m) return m[0];
      } catch { /* fall through */ }
    }
  }
  return "";
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Every browser POST/GET carries an Origin header; its absence marks a scripted
// client (curl, bots), not the SPA. Reject those outright instead of letting
// the "no origin" case skate through the same-origin gate.
function isAllowedOrigin(req) {
  const origin = req.headers?.origin || "";
  if (!origin) return false;
  const host = req.headers?.host || "";
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB — LLM prompts that big are abuse, not chat.

export default withLog(async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Rate limit + same-origin gate. An unauthenticated LLM proxy at a public
  // URL is a free quota drain for anyone who discovers it.
  if (!isAllowedOrigin(req)) {
    res.status(403).json({ status_message: "Cross-origin use is not allowed.", status_code: 403 });
    return;
  }
  // Global budget first (guards every warm instance), then per-IP.
  const global = rateLimit({ key: "groq:global", limit: 240, windowMs: 60_000 });
  if (!global.ok) {
    tooManyRequests(res, global.retryAfterSec);
    return;
  }
  const limit = rateLimit({ key: () => `groq:${clientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!limit.ok) {
    tooManyRequests(res, limit.retryAfterSec);
    return;
  }

  const key = loadKey();
  if (!key) {
    res.status(503).json({ status_message: "Groq key missing - set GROQ_API_KEY or create api/groq.key.js", status_code: 503 });
    return;
  }
  const auth = { Authorization: `Bearer ${key}` };
  try {
    const url = new URL(req.url, "http://localhost");
    let pathname = url.pathname.replace(/^\/api\/groq\/?/, "");
    if (pathname === "/") pathname = "models";
    if (req.method === "GET") {
      if (pathname === "models") {
        const r = await fetch(`${GROQ_BASE}/models`, { headers: auth });
        res.status(r.status);
        res.setHeader("content-type", r.headers.get("content-type") || "application/json");
        res.send(await r.text());
        return;
      }
    }
    let body = {};
    let bodySize = 0;
    try {
      body = req.body ?? (req.rawBody ? JSON.parse(req.rawBody) : {});
      bodySize = typeof body === "object" && body !== null ? Buffer.byteLength(JSON.stringify(body)) : 0;
    } catch {
      body = {};
    }
    if (pathname === "chat") {
      if (bodySize > MAX_BODY_BYTES) {
        res.status(413).json({ status_message: "Request body too large.", status_code: 413 });
        return;
      }
      const r = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, stream: false }),
      });
      res.status(r.status);
      res.setHeader("content-type", r.headers.get("content-type") || "application/json");
      res.send(await r.text());
      return;
    }
    res.status(404).json({ status_message: "Unknown Groq endpoint", status_code: 404 });
  } catch (error) {
    res.status(502).json({ status_message: `Groq proxy failed: ${error?.message || "unknown"}`, status_code: 502 });
  }
});
