/* Probe every player server against the real upstream, for BOTH a movie and a
   series episode, using the LOCAL handler (not the deployed function) so the
   result reflects the working tree.

   This is a PLAYBACK probe, not a resolve probe: a row only passes when the
   resolve returns a variant, that variant's playlist parses, and its first
   media segment returns real container bytes (fMP4 `styp`/`moof` or TS sync).
   A 200 resolve whose segment 403s is a failure here, which is the whole point.

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

/* Menu order, matching `PLAYER_SOURCES` (src/constants/sources.js). `server` is
   sent WITHOUT `prefer` so a pick cannot fall through: this probe must prove
   THAT row plays, not that some other row rescued the request. Auto is probed
   separately with `auto: true`. */
const SERVERS = [
  { key: "zxc-orion", label: "Server 1", server: "orion" },
  { key: "zxc-valstrax", label: "Server 2", server: "valstrax" },
  { key: "zxc-atlas", label: "Server 3", server: "atlas" },
  { key: "zxc-ursa", label: "Server 4", server: "ursa" },
  { key: "zxc-alatreon", label: "Server 5", server: "alatreon" },
  { key: "zxc-daedalus", label: "Server 6", server: "daedalus" },
  { key: "__auto__", label: "Auto", auto: true },
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
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { /* keep text */ } }
  return { ms: Date.now() - t0, status: res.statusCode, headers: res.headers, payload: parsed };
}

const isPlaylist = (x) => typeof x === "string" && x.startsWith("#EXTM3U");

function firstUri(text, baseUrl) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    try { return new URL(line, baseUrl).toString(); } catch { return ""; }
  }
  return "";
}

function byteKind(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return "";
  const head = buf.subarray(0, Math.min(buf.length, 12));
  if (head.includes(Buffer.from("styp")) || head.includes(Buffer.from("moof"))) return "fmp4";
  if (head[0] === 0x47) return "ts";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF") return "riff";
  return "";
}

/* Resolve -> master/media playlist -> first segment bytes. */
async function playback(payload) {
  const variant = (payload.variants || []).find((v) => v?.uri);
  if (!variant) return { ok: false, note: "resolve returned no variant" };
  const refUrl = payload.source?.refUrl || "";

  let playlistUrl = variant.uri;
  let p = await call({ action: "playlist", playlistUrl, refUrl });
  if (p.status !== 200 || !isPlaylist(p.payload)) {
    return { ok: false, note: `playlist HTTP ${p.status}: ${String(p.payload?.error || p.payload).slice(0, 80)}` };
  }
  let text = p.payload;
  if (text.includes("#EXT-X-STREAM-INF")) {
    const child = firstUri(text, playlistUrl);
    if (!child) return { ok: false, note: "master playlist has no variant URI" };
    playlistUrl = child;
    p = await call({ action: "playlist", playlistUrl, refUrl });
    if (p.status !== 200 || !isPlaylist(p.payload)) {
      return { ok: false, note: `media playlist HTTP ${p.status}: ${String(p.payload?.error || p.payload).slice(0, 80)}` };
    }
    text = p.payload;
  }
  if (/#EXT-X-KEY:[^\n]*METHOD=AES-128/.test(text)) {
    return { ok: false, note: "AES-128 ladder (hls.js would need a key host)" };
  }
  const segment = firstUri(text, playlistUrl);
  if (!segment) return { ok: false, note: "media playlist has no segment URI" };

  const s = await call({ action: "segment", url: segment, refUrl, range: { start: 0, max: 65536 } });
  const kind = byteKind(s.payload);
  if (s.status !== 200 || !kind) {
    return { ok: false, note: `segment HTTP ${s.status} (${s.payload?.error || "no media bytes"})` };
  }
  return { ok: true, bytes: s.payload.length, codec: kind, more: s.headers["x-streamly-more"] === "1" };
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
    source: p.source?.kind || "",
  };
}

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const s of SERVERS) {
  for (const kind of ["movie", "tv"]) {
    const base = { action: "resolvezxc", type: kind, id: kind === "movie" ? movieId : tvId };
    if (s.auto) base.auto = true;
    else base.server = s.server;
    if (kind === "tv") { base.season = season; base.episode = episode; }

    const r = await call(base);
    const sum = summarize(r);
    const play = sum.ok ? await playback(r.payload) : { ok: false, note: sum.note };
    const row = { server: s, kind, ...sum, play, ms: r.ms, status: r.status };
    results.push(row);

    const tag = `${s.label} ${s.key}`.padEnd(28);
    const kindTag = kind.padEnd(5);
    const served = r.payload?.server ? ` -> ${r.payload.server}` : "";
    const detail = sum.ok ? play.note : sum.note;
    if (play.ok) {
      console.log(
        `  PASS  ${tag} ${kindTag} ${String(sum.n).padStart(2)} var  max=${String(sum.max).padStart(4)}p  ` +
        `audio=${sum.audio}  ${play.codec} ${play.bytes}B${play.more ? "+" : ""}  ${String(r.ms).padStart(6)}ms${served}`,
      );
    } else {
      console.log(
        `  FAIL  ${tag} ${kindTag} ${String(r.ms).padStart(6)}ms  http=${r.status}  ` +
        `${detail}${served}`,
      );
    }

    // Space probes out so the provider's burst rate-limit (429) does not
    // cascade into false negatives on later servers.
    await sleep(2000);
  }
}

const failed = results.filter((r) => !r.play.ok);
console.log(`\n${results.length - failed.length}/${results.length} played real media bytes`);
if (failed.length) {
  console.log("\nFAILURES:");
  for (const f of failed) console.log(`  ${f.server.label} (${f.server.key}) [${f.kind}]: ${f.play.note}`);
  process.exitCode = 1;
}
