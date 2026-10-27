/* sync-zxc-contract.mjs — keep the ZXC provider contract truthful, hands-free.
 *
 * The upstream provider periodically renames its token-mint path and rotates
 * the obfuscated param names (see the rename history in api/stream.js). When it
 * does, every server 404s at once. `api/stream.js` already self-heals at request
 * time by re-deriving the contract from the provider's own chunk, but that fix
 * lives only in memory — this script makes the fix PERMANENT and PROVEN:
 *
 *   1. Derive the current contract straight from the provider's shipped chunk.
 *   2. Compare it to the committed seed in `api/stream.js`.
 *   3. If it drifted, rewrite the `<zxc-contract>` block in place (and the path
 *      pinned in the test) so the repo matches reality.
 *   4. Play a REAL movie AND a REAL series end-to-end through the in-repo
 *      handler, trying each server, to prove playback actually works.
 *
 * Run by `.github/workflows/sync-zxc-contract.yml` on a daily cron, and mirrored
 * by the Vercel Cron watchdog in `api/sync-contract.js`. The workflow commits +
 * pushes only when the seed changed AND playback verified, so a rename lands as
 * a tidy commit that redeploys — no human in the loop.
 *
 * Locally:  node scripts/sync-zxc-contract.mjs [--dry-run] [--strict]
 *   · --dry-run  derive/verify but never write files.
 *   · --strict   exit 1 when playback cannot be verified. Default (CI) is
 *                lenient: a runner whose egress the provider blocks must not turn
 *                the daily job red — the Vercel cron covers that case.
 *
 * Callers read `ZXC_SYNC_CHANGED=<true|false>` (also appended to GITHUB_OUTPUT).
 * `changed=true` means: a rewrite was applied AND playback verified. Nothing is
 * ever signalled as changed on unverified playback.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const STREAM_FILE = join(ROOT, "api", "stream.js");
const TEST_FILE = join(ROOT, "src", "__tests__", "zxcMintPath.test.js");

const DRY_RUN = process.argv.includes("--dry-run");
const STRICT = process.argv.includes("--strict");

const PROBE = { movie: "27205", tv: "1399", season: "1", episode: "1" };
// The live rows, in menu order (`src/constants/sources.js`). A single pass on
// ANY row is enough to call the contract playable, but every row gets a REAL
// bytes check when it is tried — a resolve that says ok:true is not playback.
const SERVERS = ["orion", "valstrax", "atlas", "ursa", "alatreon", "daedalus"];

const log = (msg) => console.log(`[sync-zxc] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Preserve the file's OWN line endings. The repo stores LF blobs (Windows
// working copies read CRLF via core.autocrlf), so coercing to CRLF turns a
// one-line rename into a whole-file diff. Detect what was read and keep it.
const eolOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");

// One module instance: the seed/patch helpers and the real request handler all
// come from the very file being kept truthful.
const streamMod = await import(pathToFileURL(STREAM_FILE).href);
const {
  default: handler,
  fetchLiveZxcContract,
  zxcContractSeed,
  zxcContractEquals,
  describeZxcContractChange,
  applyZxcContractToSource,
  applyZxcContractToTest,
} = streamMod;

/* 3. Rewrite the seed block + the path pinned in the test (CRLF, no BOM). */
function applySeed(seedContract) {
  const src = readFileSync(STREAM_FILE, "utf8");
  const next = applyZxcContractToSource(src, seedContract).split(/\r?\n/).join(eolOf(src));

  const test = readFileSync(TEST_FILE, "utf8");
  const nextTest = applyZxcContractToTest(test, seedContract);

  if (!DRY_RUN) {
    writeFileSync(STREAM_FILE, next, "utf8");
    if (nextTest !== test) writeFileSync(TEST_FILE, nextTest, "utf8");
  }
  return next !== src || nextTest !== test;
}

/* Prove playback through the real handler (movie + series). */
function makeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    json(p) { this.body = p; return this; },
    send(p) { this.body = p; return this; },
    end() { /* noop */ },
  };
}

async function callHandler(body) {
  const res = makeRes();
  await handler({ method: "POST", body, headers: { "x-forwarded-for": "203.0.113.9" } }, res);
  let payload = res.body;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { /* keep text */ }
  }
  return { status: res.statusCode, headers: res.headers, payload };
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
  return "";
}

/* Resolve -> playlist -> first segment BYTES. The same bar as the player: a
   row whose master 200s but whose segment 403s must not verify a new seed. */
async function playRow(server, kind) {
  const body = { action: "resolvezxc", type: kind, id: kind === "movie" ? PROBE.movie : PROBE.tv, server };
  if (kind === "tv") { body.season = PROBE.season; body.episode = PROBE.episode; }
  const resolved = await callHandler(body);
  const payload = resolved.payload;
  if (payload?.ok !== true) {
    return { ok: false, note: `${payload?.code || "?"} ${payload?.error || ""}`.trim() };
  }
  const variant = (payload.variants || []).find((v) => v?.uri);
  if (!variant) return { ok: false, note: "resolve returned no variant" };
  const refUrl = payload.source?.refUrl || "";

  let playlistUrl = variant.uri;
  let list = await callHandler({ action: "playlist", playlistUrl, refUrl });
  if (list.status !== 200 || !isPlaylist(list.payload)) {
    return { ok: false, note: `playlist HTTP ${list.status}` };
  }
  let text = list.payload;
  if (text.includes("#EXT-X-STREAM-INF")) {
    playlistUrl = firstUri(text, playlistUrl);
    if (!playlistUrl) return { ok: false, note: "master has no variant URI" };
    list = await callHandler({ action: "playlist", playlistUrl, refUrl });
    if (list.status !== 200 || !isPlaylist(list.payload)) {
      return { ok: false, note: `media playlist HTTP ${list.status}` };
    }
    text = list.payload;
  }
  const segment = firstUri(text, playlistUrl);
  if (!segment) return { ok: false, note: "media playlist has no segment URI" };

  const bytes = await callHandler({ action: "segment", url: segment, refUrl, range: { start: 0, max: 65536 } });
  const codec = byteKind(bytes.payload);
  if (bytes.status !== 200 || !codec) return { ok: false, note: `segment HTTP ${bytes.status}` };
  return {
    ok: true,
    server,
    variants: (payload.variants || []).filter((v) => v?.uri).length,
    audio: Array.isArray(payload.audioTracks) ? payload.audioTracks.length : 0,
    codec,
    bytes: bytes.payload.length,
  };
}

async function play(kind) {
  let lastErr = "no server attempted";
  for (const server of SERVERS) {
    try {
      const result = await playRow(server, kind);
      if (result.ok) return result;
      lastErr = `${server}: ${result.note}`;
    } catch (error) {
      lastErr = `${server}: threw ${error.message}`;
    }
    await sleep(1500);
  }
  return { ok: false, error: lastErr };
}

async function verifyPlayback() {
  let movie;
  let series;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    movie = await play("movie");
    series = await play("tv");
    if (movie.ok && series.ok) return { movie, series, attempt };
    if (attempt < 3) {
      log(`playback attempt ${attempt} incomplete (movie ${movie.ok ? "ok" : "fail"}, series ${series.ok ? "ok" : "fail"}); retrying in 15s`);
      await sleep(15000);
    }
  }
  return { movie, series };
}

/* ── main ─────────────────────────────────────────────────────────────── */
const derived = await fetchLiveZxcContract().catch((error) => {
  log(`could not derive a contract from the live chunk: ${error.message}`);
  return null;
});
const seed = zxcContractSeed();
let rewrote = false;
let changes = [];

if (derived && !zxcContractEquals(seed, derived)) {
  changes = describeZxcContractChange(seed, derived);
  log("contract DRIFT detected");
  log(`  committed: mint=${seed.mintPath} tmdbId=${seed.params.tmdbId}`);
  log(`  live:      mint=${derived.mintPath} tmdbId=${derived.params.tmdbId}`);
  for (const change of changes) log(`  changed: ${change}`);
  rewrote = applySeed(derived);
  log(DRY_RUN ? "dry-run: seed rewrite skipped" : "rewrote api/stream.js seed + pinned test path");
} else if (derived) {
  log("seed matches the live provider chunk — no rewrite needed");
} else {
  log("WARNING: could not derive a contract from the live chunk; relying on runtime self-heal");
}

// Let the provider cool down after the chunk fetches — back-to-back bursts
// occasionally earn a soft throttle that looks like a dead server.
await sleep(3000);

const { movie, series } = await verifyPlayback();
log(`movie  playback: ${movie.ok ? `OK via ${movie.server} (${movie.variants} variants, ${movie.codec} ${movie.bytes}B)` : `FAIL (${movie.error})`}`);
log(`series playback: ${series.ok ? `OK via ${series.server} (${series.variants} variants, ${series.audio} audio, ${series.codec} ${series.bytes}B)` : `FAIL (${series.error})`}`);

const verified = movie.ok && series.ok;
// Only a VERIFIED rewrite is a change worth committing. An unverified run —
// typically a runner whose egress the provider blocks — reports false and is
// left to the Vercel cron watchdog, never committing an unproven contract.
const changed = rewrote && verified;
if (rewrote && !verified) {
  log("WARNING: rewrite applied but playback could NOT be verified — not signalling a commit");
} else if (!derived) {
  log("WARNING: live contract unavailable from this environment — nothing to do");
}

// A concise one-line headline plus the full field list, so the commit message
// says what actually changed ("mint /backend/a -> /backend/b") instead of a
// generic "auto-sync". Values are single-line: GITHUB_OUTPUT is name=value.
const headline = changes[0] || "provider contract refresh";
const summary = changes.length ? changes.join("; ") : "no field difference";

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `headline=${headline}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `summary=${summary}\n`);
}
log(`changed=${changed} headline=${headline}`);
console.log(`ZXC_SYNC_CHANGED=${changed}`);

if (!verified && STRICT) {
  log("playback verification FAILED (strict mode) — exiting 1");
  process.exitCode = 1;
}
