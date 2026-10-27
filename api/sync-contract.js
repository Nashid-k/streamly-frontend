// api/sync-contract.js — Vercel Cron watchdog for the ZXC provider contract.
//
// Belt-and-suspenders: `.github/workflows/sync-zxc-contract.yml` runs daily and
// commits any drift, and `api/stream.js` self-heals at request time. This is the
// third layer — Vercel's own cron — so the committed seed still self-repairs even
// if Actions is disabled or throttled. It runs from Vercel's network (bom1),
// which reaches the provider even when a GitHub runner's egress does not.
//
// What it does, every run:
//   1. Derive the live contract from the provider's shipped chunk.
//   2. Compare it to the committed seed in api/stream.js.
//   3. Play a REAL movie AND a REAL series through the actual handler, proving
//      real bytes (resolve -> playlist -> first media segment), not just ok:true.
//   4. Only when the contract drifted AND playback verified, commit the rewritten
//      seed block + pinned test path to the default branch through the GitHub Git
//      Data API (ONE atomic commit) using GITHUB_TOKEN, so the next Vercel deploy
//      carries the fix.
//
// Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
// The endpoint is CLOSED when CRON_SECRET is unset — this is never an open write
// path. Hit it manually with the same header; add `?dry=1` to derive + verify
// without committing.
//
// Required env: CRON_SECRET (Vercel), GITHUB_TOKEN (fine-grained, Contents:
// read/write on this repo). Optional: GITHUB_REPO, GITHUB_BRANCH.
import { logWarn } from "../src/utils/debugLogger.js";
import streamHandler, {
  fetchLiveZxcContract,
  zxcContractSeed,
  zxcContractEquals,
  describeZxcContractChange,
  applyZxcContractToSource,
  applyZxcContractToTest,
  zxcServerNames,
} from "./stream.js";

export const config = { maxDuration: 60 };

const STREAM_PATH = "api/stream.js";
const TEST_PATH = "src/__tests__/zxcMintPath.test.js";
const REPO = process.env.GITHUB_REPO || "Nashid-k/streamly-frontend";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const API = "https://api.github.com";

const PROBE = { movie: "27205", tv: "1399", season: "1", episode: "1" };
// Leave headroom under maxDuration for the GitHub commit round trips (5 calls).
const VERIFY_DEADLINE_MS = 45_000;
const SEGMENT_PROBE_BYTES = 64 * 1024;
const ROW_PAUSE_MS = 500;

function send(res, status, body) {
  res.status(status);
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.send(JSON.stringify(body));
}

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = String(req.headers?.authorization || req.headers?.Authorization || "");
  return header === `Bearer ${secret}`;
}

/* ── GitHub helpers (Git Data API → one atomic commit) ────────────────── */
function ghHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "streamly-contract-sync",
    "content-type": "application/json",
  };
}

async function ghJson(url, token, init) {
  const res = await fetch(url, { ...init, headers: ghHeaders(token) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub ${init?.method || "GET"} ${url} -> HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

async function readFileAt(path, token) {
  const data = await ghJson(`${API}/repos/${REPO}/contents/${path}?ref=${BRANCH}`, token);
  return Buffer.from(data.content, "base64").toString("utf8");
}

/* One commit touching every changed file, via tree/blob plumbing. Avoids the
   two-commits-with-a-transiently-failing-test window the Contents API would make. */
async function commitFiles(files, token, message) {
  const ref = await ghJson(`${API}/repos/${REPO}/git/ref/heads/${BRANCH}`, token);
  const headSha = ref.object.sha;
  const headCommit = await ghJson(`${API}/repos/${REPO}/git/commits/${headSha}`, token);

  const tree = [];
  for (const file of files) {
    const blob = await ghJson(`${API}/repos/${REPO}/git/blobs`, token, {
      method: "POST",
      body: JSON.stringify({
        content: Buffer.from(file.content, "utf8").toString("base64"),
        encoding: "base64",
      }),
    });
    tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const newTree = await ghJson(`${API}/repos/${REPO}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
  });
  const newCommit = await ghJson(`${API}/repos/${REPO}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha] }),
  });
  await ghJson(`${API}/repos/${REPO}/git/refs/heads/${BRANCH}`, token, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });
  return newCommit.sha;
}

// Preserve the file's OWN line endings: the repo stores LF blobs, so coercing
// to CRLF would turn a one-line rename into a whole-file diff on every sync.
const eolOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");

/* Build the changed files (if any) by patching the CURRENT repo text, so a
   concurrent push never gets clobbered by our stale in-bundle copy. */
async function buildChangedFiles(contract, token) {
  const files = [];
  const streamSrc = await readFileAt(STREAM_PATH, token);
  const nextStream = applyZxcContractToSource(streamSrc, contract).split(/\r?\n/).join(eolOf(streamSrc));
  if (nextStream !== streamSrc) files.push({ path: STREAM_PATH, content: nextStream });

  const testSrc = await readFileAt(TEST_PATH, token);
  const nextTest = applyZxcContractToTest(testSrc, contract);
  if (nextTest !== testSrc) files.push({ path: TEST_PATH, content: nextTest });
  return files;
}

/* ── Playback watchdog (real bytes through the real handler) ──────────── */
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
  await streamHandler({ method: "POST", body, headers: { "x-forwarded-for": "203.0.113.9" } }, res);
  let payload = res.body;
  if (typeof payload === "string" && /^\s*[[{]/.test(payload)) {
    try {
      payload = JSON.parse(payload);
    } catch {
      // Keep the text; a malformed JSON body is a failure the caller reports.
    }
  }
  return { status: res.statusCode, payload };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPlaylist(text) {
  return typeof text === "string" && text.startsWith("#EXTM3U");
}

/* The first URI of a MEDIA playlist (what to fetch for real bytes). */
function firstUri(text, baseUrl) {
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line && !line.startsWith("#")) return new URL(line, baseUrl).toString();
  }
  return "";
}

/* The first VIDEO variant of a MASTER playlist. The first URI in a master can be
   an #EXT-X-MEDIA audio rendition, so taking the first non-comment line would
   verify the audio track (or 403 on its segment) instead of the video the player
   selects. Prefer the URI directly after #EXT-X-STREAM-INF. */
function firstVariantUri(text, baseUrl) {
  let expectUri = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      expectUri = true;
      continue;
    }
    if (expectUri && line && !line.startsWith("#")) return new URL(line, baseUrl).toString();
  }
  return "";
}

/* fMP4 (`styp`/`moof`) or MPEG-TS sync byte — the same byte-level gate the
   per-server probe uses. A 200 with an HTML error page is not playback. */
function byteKind(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return "";
  const head = buf.subarray(0, 12);
  if (head.includes(Buffer.from("styp")) || head.includes(Buffer.from("moof"))) return "fmp4";
  if (buf[0] === 0x47) return "ts";
  return "";
}

async function playRow(server, kind) {
  const body = { action: "resolvezxc", type: kind, id: kind === "movie" ? PROBE.movie : PROBE.tv, server };
  if (kind === "tv") { body.season = PROBE.season; body.episode = PROBE.episode; }

  let resolved;
  try {
    resolved = await callHandler(body);
  } catch (error) {
    return { ok: false, server, note: `resolve threw ${error?.message || error}` };
  }
  const payload = resolved.payload;
  if (resolved.status !== 200 || payload?.ok !== true) {
    return { ok: false, server, note: `resolve HTTP ${resolved.status} ${payload?.code || ""} ${payload?.error || ""}`.trim() };
  }
  const variant = (payload.variants || []).find((v) => v?.uri);
  if (!variant) return { ok: false, server, note: "resolve returned no variant" };

  const refUrl = payload.source?.refUrl || "";
  let playlistUrl = String(variant.uri);
  let list = await callHandler({ action: "playlist", playlistUrl, refUrl });
  if (list.status !== 200 || !isPlaylist(list.payload)) {
    return { ok: false, server, note: `playlist HTTP ${list.status}` };
  }
  let text = list.payload;

  // Some servers hand back a master even though the resolve exposed one level.
  // Walk into the first VIDEO variant before looking for a segment.
  if (text.includes("#EXT-X-STREAM-INF")) {
    const next = firstVariantUri(text, playlistUrl);
    if (!next) return { ok: false, server, note: "master playlist has no stream variant" };
    playlistUrl = next;
    list = await callHandler({ action: "playlist", playlistUrl, refUrl });
    if (list.status !== 200 || !isPlaylist(list.payload)) {
      return { ok: false, server, note: `variant playlist HTTP ${list.status}` };
    }
    text = list.payload;
  }

  const segment = firstUri(text, playlistUrl);
  if (!segment) return { ok: false, server, note: "media playlist has no segment URI" };

  const bytes = await callHandler({
    action: "segment",
    url: segment,
    refUrl,
    range: { start: 0, max: SEGMENT_PROBE_BYTES },
  });
  const codec = byteKind(bytes.payload);
  if (bytes.status !== 200 || !codec) return { ok: false, server, note: `segment HTTP ${bytes.status}` };

  return {
    ok: true,
    server,
    variants: (payload.variants || []).filter((v) => v?.uri).length,
    audio: Array.isArray(payload.audioTracks) ? payload.audioTracks.length : 0,
    codec,
    bytes: bytes.payload.length,
  };
}

async function play(kind, deadline) {
  let lastErr = "no server attempted";
  for (const server of zxcServerNames()) {
    if (Date.now() > deadline) return { ok: false, error: `deadline reached; last: ${lastErr}` };
    try {
      const row = await playRow(server, kind);
      if (row.ok) return row;
      lastErr = `${server}: ${row.note}`;
    } catch (error) {
      lastErr = `${server}: threw ${error?.message || error}`;
    }
    await sleep(ROW_PAUSE_MS);
  }
  return { ok: false, error: lastErr };
}

async function verifyPlayback(deadline) {
  const movie = await play("movie", deadline);
  const series = await play("tv", deadline);
  return { movie, series };
}

export default async function syncContract(req, res) {
  if (!authorized(req)) {
    send(res, 401, { ok: false, error: "unauthorized", code: "unauthorized" });
    return;
  }

  const dry = /[?&]dry=1\b/.test(req.url || "");
  const seed = zxcContractSeed();
  const deadline = Date.now() + VERIFY_DEADLINE_MS;

  let derived = null;
  let deriveError = null;
  try {
    derived = await fetchLiveZxcContract();
  } catch (error) {
    deriveError = error?.message || String(error);
    logWarn("api", "sync-contract: could not derive live contract", { message: deriveError });
  }
  const drifted = !!(derived && !zxcContractEquals(seed, derived));

  // Verify BEFORE committing: a watchdog must never make an unproven contract
  // permanent. If either a movie or a series cannot produce real bytes, the drift
  // (if any) is reported and left for the next run.
  const verification = await verifyPlayback(deadline);
  const verified = verification.movie.ok && verification.series.ok;

  let pushed = false;
  let commitSha = null;
  let pushError = null;

  if (drifted && !dry) {
    if (!verified) {
      pushError = "playback not verified; refusing to commit an unproven contract";
      logWarn("api", "sync-contract: contract drifted but playback did not verify; not committing", {
        movie: verification.movie.error || verification.movie.note,
        series: verification.series.error || verification.series.note,
      });
    } else {
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        pushError = "GITHUB_TOKEN not set";
        logWarn("api", "sync-contract: contract drifted but GITHUB_TOKEN is not set");
      } else {
        try {
          const files = await buildChangedFiles(derived, token);
          if (files.length) {
            const changes = describeZxcContractChange(seed, derived);
            const headline = changes[0] || "provider contract refresh";
            const summary = changes.length ? changes.join("; ") : "no field difference";
            const message = [
              `chore(zxc): sync provider contract - ${headline}`,
              "",
              "Provider-renamed / rotated fields (derived from the live chunk):",
              "",
              summary,
              "",
              "Auto-synced by the Vercel cron watchdog (api/sync-contract.js).",
            ].join("\n");
            commitSha = await commitFiles(files, token, message);
            pushed = true;
          } else {
            pushError = "drift detected but no file diff was produced";
          }
        } catch (error) {
          pushError = error?.message || String(error);
          logWarn("api", "sync-contract: commit failed", { message: pushError });
        }
      }
    }
  }

  // A drifted contract that is neither committed (successfully) nor dry-run is
  // still pending, so the run is not healthy even if playback happens to work.
  const pending = drifted && !dry && !pushed;

  send(res, 200, {
    ok: !deriveError && verified && !pending,
    dry,
    drifted,
    verified,
    pushed,
    pending,
    commit: commitSha,
    pushError,
    deriveError,
    seed,
    derived,
    verification,
  });
}
