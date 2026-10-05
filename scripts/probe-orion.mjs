/* Live probe: orion resolve + playlist thumbnail/AUDIO inspection + intro data.
   Usage: node scripts/probe-orion.mjs [tmdbId=579974] */
import { pathToFileURL } from "node:url";

const { default: handler } = await import(
  pathToFileURL(new URL("../api/stream.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")).href
);

const tmdbId = process.argv[2] || "579974";

function makeRes() {
  const res = {
    statusCode: null, headers: {}, body: null,
    status(c) { res.statusCode = c; return res; },
    setHeader(k, v) { res.headers[String(k).toLowerCase()] = v; return res; },
    json(p) { res.body = p; return res; },
    send(p) { res.body = p; return res; },
    end() { return res; },
  };
  return res;
}

async function call(body) {
  const req = { method: "POST", body, headers: { "x-forwarded-for": "203.0.113.9" } };
  const res = makeRes();
  await handler(req, res);
  let parsed = res.body;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { /* keep */ } }
  return { status: res.statusCode, payload: parsed };
}

console.log("== resolvezxc orion movie", tmdbId);
const r = await call({ action: "resolvezxc", type: "movie", id: tmdbId, server: "orion" });
console.log("HTTP", r.status, "ok:", r.payload?.ok, r.payload?.code || "", (r.payload?.error || "").slice(0, 120));
const variants = (r.payload?.variants || []).filter((v) => v?.uri);
console.log("variants:", variants.length, variants.map((v) => v.label || v.height).join(","));
console.log("audioTracks:", JSON.stringify(r.payload?.audioTracks || []).slice(0, 600));

if (variants.length > 0) {
  console.log("\n== playlist text (first variant)");
  const p = await call({ action: "playlist", playlistUrl: variants[0].uri, refUrl: r.payload?.source?.refUrl || "" });
  const text = typeof p.payload === "string" ? p.payload : JSON.stringify(p.payload).slice(0, 300);
  console.log("HTTP", p.status, "chars:", text.length);
  for (const line of text.split("\n").slice(0, 25)) console.log("  " + line.slice(0, 160));
  console.log("has IMAGE-STREAM-INF:", text.includes("IMAGE-STREAM-INF"));
  console.log("has X-MEDIA AUDIO:", /EXT-X-MEDIA[^\\n]*TYPE=AUDIO/.test(text));
}

console.log("\n== /backend/intro (vidstuck, plain GET, no mint)");
try {
  const ir = await fetch(
    `https://vidstuck.xyz/backend/intro?imdbId=tt8178634&season=1&episode=1&tmdbId=${tmdbId}`,
    { headers: { Origin: "https://vidstuck.xyz", Referer: "https://vidstuck.xyz/embed/movie/579974" } },
  );
  console.log("HTTP", ir.status);
  console.log((await ir.text()).slice(0, 500));
} catch (e) {
  console.log("fetch failed:", e.message);
}
