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
 * Run by `.github/workflows/sync-zxc-contract.yml` on a daily cron. The workflow
 * commits + pushes only when the seed changed and playback verified, so a
 * rename lands as a tidy commit that redeploys — no human in the loop.
 *
 * Locally:  node scripts/sync-zxc-contract.mjs [--dry-run]
 * Exit code: 0 = seed in sync (or rewritten) and playback verified; 1 = playback
 * could not be verified (nothing is committed — see the workflow's step gate).
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const STREAM_FILE = join(ROOT, "api", "stream.js");
const TEST_FILE = join(ROOT, "src", "__tests__", "zxcMintPath.test.js");

const DRY_RUN = process.argv.includes("--dry-run");

const ORIGIN = "https://vidstuck.xyz";
const CHUNK_RE = /\/_next\/static\/chunks\/[A-Za-z0-9._/-]+\.js/g;
const PROBE = { movie: "27205", tv: "1399", season: "1", episode: "1" };
// Try in this order; a single pass on ANY server is enough to call it playable.
const SERVERS = ["atlas", "centaurus", "orion", "andromeda", "meow"];
const PARAM_KEYS = ["tmdbId", "mediaType", "path", "season", "episode", "ts", "token", "title", "year", "date"];

const BEGIN = "// <zxc-contract:begin>";
const END = "// <zxc-contract:end>";

const log = (msg) => console.log(`[sync-zxc] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, referer) {
  const res = await fetch(url, { headers: { referer, "user-agent": "streamly-contract-sync" } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

/* 1. Derive the live contract from the provider's own shipped chunk. */
async function deriveLive() {
  const { deriveZxcContractFromChunks } = await import(pathToFileURL(STREAM_FILE).href);
  const embed = `${ORIGIN}/embed/movie/${PROBE.movie}`;
  const html = await get(embed, `${ORIGIN}/`);
  const paths = [...new Set(html.match(CHUNK_RE))];
  log(`embed lists ${paths.length} chunk(s)`);
  for (const p of paths) {
    let text;
    try {
      text = await get(`${ORIGIN}${p}`, embed);
    } catch (error) {
      log(`chunk fetch failed ${p}: ${error.message}`);
      continue;
    }
    if (!text.includes("/backend/")) continue;
    const found = deriveZxcContractFromChunks([text]);
    if (found) {
      log(`derived contract from ${p}`);
      return found;
    }
    await sleep(50);
  }
  return null;
}

/* 2. Read the seed currently committed in api/stream.js. */
function readSeed() {
  const src = readFileSync(STREAM_FILE, "utf8");
  const b = src.indexOf(BEGIN);
  const e = src.indexOf(END);
  if (b < 0 || e < 0) throw new Error("contract markers not found in api/stream.js");
  const block = src.slice(b, e);
  const pick = (re) => {
    const m = block.match(re);
    return m ? m[1] : null;
  };
  const params = {};
  for (const key of PARAM_KEYS) params[key] = pick(new RegExp(`\\b${key}:\\s*"([^"]+)"`));
  return {
    mintPath: pick(/ZXC_MINT_PATH\s*=\s*"([^"]+)"/),
    params,
    imdbParam: pick(/ZXC_IMDB_PARAM\s*=\s*"([^"]+)"/),
    latestDateParam: pick(/ZXC_LATEST_DATE_PARAM\s*=\s*"([^"]+)"/),
  };
}

const same = (a, b) =>
  !!a &&
  !!b &&
  a.mintPath === b.mintPath &&
  a.imdbParam === b.imdbParam &&
  a.latestDateParam === b.latestDateParam &&
  PARAM_KEYS.every((k) => a.params?.[k] === b.params?.[k]);

function renderBlock(c) {
  const p = c.params;
  return [
    BEGIN,
    "// AUTO-SYNCED by scripts/sync-zxc-contract.mjs (daily GitHub Action). The block",
    "// below is rewritten in place from values the script derives from the",
    "// provider's own shipped chunk and then confirms by real playback. Do not",
    "// hand-edit inside the markers — edit the script instead.",
    `const ZXC_MINT_PATH = "${c.mintPath}";`,
    "/* The obfuscated parameter names the client sends. Read straight off the",
    "   shipped bundle's `uo/up/ug/uf/uh/ul/uu/ud/uc/um` constants — renaming any of",
    "   them makes the request fail closed. */",
    "const ZXC_PARAM = {",
    ...PARAM_KEYS.map((k) => `  ${k}: "${c.params[k]}",`),
    "};",
    `const ZXC_IMDB_PARAM = "${c.imdbParam}";`,
    `const ZXC_LATEST_DATE_PARAM = "${c.latestDateParam}";`,
    END,
  ].join("\n");
}

/* 3. Rewrite the seed block + the path pinned in the test (CRLF, no BOM). */
function applySeed(seed) {
  const src = readFileSync(STREAM_FILE, "utf8");
  const b = src.indexOf(BEGIN);
  const e = src.indexOf(END);
  const next = src.slice(0, b) + renderBlock(seed) + src.slice(e + END.length);

  const test = readFileSync(TEST_FILE, "utf8");
  const nextTest = test.replace(/const MINT_PATH = "[^"]*";/, `const MINT_PATH = "${seed.mintPath}";`);

  if (!DRY_RUN) {
    writeFileSync(STREAM_FILE, Buffer.from(next.replace(/\r?\n/g, "\r\n"), "utf8"));
    if (nextTest !== test) writeFileSync(TEST_FILE, Buffer.from(nextTest.replace(/\r?\n/g, "\r\n"), "utf8"));
  }
  return next !== src || nextTest !== test;
}

/* 4. Prove playback through the real handler (movie + series). */
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

async function play(handler, kind) {
  let lastErr = "no server attempted";
  for (const server of SERVERS) {
    const body = { action: "resolvezxc", type: kind, id: kind === "movie" ? PROBE.movie : PROBE.tv, server };
    if (kind === "tv") { body.season = PROBE.season; body.episode = PROBE.episode; }
    const res = makeRes();
    let payload;
    try {
      await handler({ method: "POST", body, headers: { "x-forwarded-for": "203.0.113.9" } }, res);
      payload = typeof res.body === "string" ? JSON.parse(res.body) : res.body;
    } catch (error) {
      lastErr = `${server}: threw ${error.message}`;
      await sleep(1500);
      continue;
    }
    if (payload?.ok === true) {
      const variants = Array.isArray(payload.variants) ? payload.variants.length : 0;
      return { ok: true, server, variants, audio: Array.isArray(payload.audioTracks) ? payload.audioTracks.length : 0 };
    }
    lastErr = `${server}: ${payload?.code || "?"} ${payload?.error || ""}`;
    await sleep(1500);
  }
  return { ok: false, error: lastErr };
}

/* ── main ─────────────────────────────────────────────────────────────── */
const derived = await deriveLive();
const seed = readSeed();
let changed = false;

if (derived && !same(seed, derived)) {
  log("contract DRIFT detected");
  log(`  committed: mint=${seed.mintPath} tmdbId=${seed.params.tmdbId}`);
  log(`  live:      mint=${derived.mintPath} tmdbId=${derived.params.tmdbId}`);
  changed = applySeed(derived);
  log(DRY_RUN ? "dry-run: seed rewrite skipped" : "rewrote api/stream.js seed + pinned test path");
} else if (derived) {
  log("seed matches the live provider chunk — no rewrite needed");
} else {
  log("WARNING: could not derive a contract from the live chunk; relying on runtime self-heal");
}

const { default: handler } = await import(pathToFileURL(STREAM_FILE).href);
// Let the provider cool down after the chunk fetches — back-to-back bursts
// occasionally earn a soft throttle that looks like a dead server.
await sleep(3000);

async function verifyPlayback() {
  let movie;
  let series;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    movie = await play(handler, "movie");
    series = await play(handler, "tv");
    if (movie.ok && series.ok) return { movie, series, attempt };
    if (attempt < 3) {
      log(`playback attempt ${attempt} incomplete (movie ${movie.ok ? "ok" : "fail"}, series ${series.ok ? "ok" : "fail"}); retrying in 15s`);
      await sleep(15000);
    }
  }
  return { movie, series };
}

const { movie, series } = await verifyPlayback();
log(`movie  playback: ${movie.ok ? `OK via ${movie.server} (${movie.variants} variants)` : `FAIL (${movie.error})`}`);
log(`series playback: ${series.ok ? `OK via ${series.server} (${series.variants} variants, ${series.audio} audio)` : `FAIL (${series.error})`}`);

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
console.log(`ZXC_SYNC_CHANGED=${changed}`);

if (!movie.ok || !series.ok) {
  log("playback verification FAILED — nothing will be committed");
  process.exitCode = 1;
}
