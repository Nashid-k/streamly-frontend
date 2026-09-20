// api/groq.js - serverless Groq proxy. Groq key stays SERVER-side (git-ignored
// api/groq.key.js local fallback + process.env.GROQ_API_KEY for Vercel), never
// ships in the bundle. Same same-origin pattern as api/tmdb.js: the Vite dev
// middleware + vercel rewrites route /api/groq to this function.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withLog } from "./lib/logger.js";

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

export default withLog(async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
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
    try { body = req.body ?? (req.rawBody ? JSON.parse(req.rawBody) : {}); } catch { body = {}; }
    if (pathname === "chat") {
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
