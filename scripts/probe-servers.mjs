/* Probe every player server against the real upstream, for BOTH a movie and a
   series episode, using the LOCAL handler (not the deployed function) so the
   result reflects the working tree.

   Usage:
     node scripts/probe-servers.mjs                 # 1 movie + 1 tv, all servers
     node scripts/probe-servers.mjs 27205 1399 1 1  # tmdbIdMovie tmdbIdTv season episode

   Every request is a real network call to a real provider. Nothing is mocked. */
import { pathToFileURL } from "node:url";

const { default: handler } = await import(
  pathToFileURL(new URL("../api/stream.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")).href
);

const argv = process.argv.slice(2);
const nums = argv.filter((a) => /^\d+$/.test(a));
const [movieId, tvId, season = "1", episode = "1"] = nums.length ? nums : ["27205", "1399", "1", "1"];

/* The five live rows in menu order, matching `PLAYER_SOURCES`
   (`src/constants/sources.js`) and `ZXC_SERVERS` in `api/stream.js`. The old
   vidcore/vidsrc/nhd/milkyway rows were removed after this script was written,
   so listing them here only produced guaranteed no-source failures. */
const SERVERS = [
  { key: "zxc-centaurus", label: "Server 1", action: "resolvezxc", extra: { server: "centaurus" } },
  { key: "zxc-andromeda", label: "Server 2", action: "resolvezxc", extra: { server: "andromeda" } },
  { key: "zxc-atlas", label: "Server 3", action: "resolvezxc", extra: { server: "atlas" } },
  { key: "zxc-meow", label: "Server 4", action: "resolvezxc", extra: { server: "meow" } },
  { key: "zxc-orion", label: "Server 5", action: "resolvezxc", extra: { server: "orion" } },
];

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
  const t0 = Date.now();
  await handler(req, res);
  let parsed = res.body;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { /* keep */ } }
  return { ms: Date.now() - t0, status: res.statusCode, payload: parsed };
}

function summarize(r) {
  const p = r.payload || {};
  if (p.ok !== true) return { ok: false, note: `${p.code || "?"}: ${p.error || "(no error)"}` };
  const v = (p.variants || []).filter((x) => x?.uri);
  const heights = v.map((x) => x.height || 0);
  return {
    ok: true,
    n: v.length,
    max: heights.length ? Math.max(...heights) : 0,
    audio: Array.isArray(p.audioTracks) ? p.audioTracks.length : 0,
    ladder: p.ladderSource || "",
    note: p.upgradeable ? "upgradeable" : p.cached ? "cached" : "",
  };
}

const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const s of SERVERS) {
  for (const kind of ["movie", "tv"]) {
    const base = { action: s.action, type: kind, id: kind === "movie" ? movieId : tvId, ...s.extra };
    if (kind === "tv") { base.season = season; base.episode = episode; }

    let r = await call(base);
    let sum = summarize(r);

    results.push({ server: s, kind, ...sum, ms: r.ms, status: r.status });
    const tag = `${s.label} ${s.key}`.padEnd(26);
    const kindTag = kind.padEnd(5);

    /* Space out server probes so the provider's burst rate-limit (429)
       doesn't cascade into false negatives on later servers. */
    await sleep(2000);

    if (sum.ok) {
      console.log(`  PASS  ${tag} ${kindTag} ${String(sum.n).padStart(2)} var  max=${String(sum.max).padStart(4)}p  audio=${sum.audio}  ${String(r.ms).padStart(6)}ms  ${sum.ladder} ${sum.note}`);
    } else {
      console.log(`  FAIL  ${tag} ${kindTag} ${String(r.ms).padStart(6)}ms  http=${r.status}  ${sum.note}`);
    }
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("\nFAILURES:");
  for (const f of failed) console.log(`  ${f.server.label} (${f.server.key}) [${f.kind}]: ${f.note}`);
  process.exitCode = 1;
}