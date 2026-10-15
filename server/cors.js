// server/cors.js — origin-scoped CORS for the API handlers.
//
// Every browser caller of these endpoints is same-origin in production: the SPA
// and the serverless functions ship from one Vercel deployment, and the
// endpoints authenticate with bearer tokens carried in the body/header (never
// cookies). A blanket `Access-Control-Allow-Origin: *` therefore bought nothing
// for legitimate use while letting ANY web page call the relay from the
// browser. Emit ACAO only when the request Origin matches the configured site
// (SITE_URL / VITE_SITE_URL); same-origin and server-to-server callers send no
// Origin and need no header at all.

function siteOrigins() {
  const out = new Set();
  for (const raw of [process.env.SITE_URL, process.env.VITE_SITE_URL]) {
    if (!raw) continue;
    try {
      out.add(new URL(String(raw).trim()).origin);
    } catch {
      // An unparseable value simply yields a stricter allowlist; the handler
      // still works for same-origin callers.
    }
  }
  return out;
}

/* Set CORS headers on `res` for `req`. Returns the resolved allow-origin (or an
   empty string when the request is same-origin / not allowlisted). Callers keep
   setting Methods/Headers/Expose themselves. */
export function applyCors(req, res) {
  // Always vary: a shared cache must never hand one origin's ACAO to another.
  res.setHeader("Vary", "Origin");
  const origin = req?.headers?.origin;
  if (!origin) return "";
  if (!siteOrigins().has(origin)) return "";
  res.setHeader("Access-Control-Allow-Origin", origin);
  return origin;
}
