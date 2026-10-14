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
//   3. If it drifted, commit the rewritten seed block + pinned test path to the
//      default branch through the GitHub Git Data API (ONE atomic commit) using
//      GITHUB_TOKEN, so the next Vercel deploy carries the fix.
//   4. Play a REAL movie AND a REAL series through the actual handler to prove
//      playback works, and report the outcome as JSON.
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
} from "./stream.js";

export const config = { maxDuration: 60 };

const STREAM_PATH = "api/stream.js";
const TEST_PATH = "src/__tests__/zxcMintPath.test.js";
const REPO = process.env.GITHUB_REPO || "Nashid-k/streamly-frontend";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const API = "https://api.github.com";

const PROBE = { movie: "27205", tv: "1399", season: "1", episode: "1" };
const SERVERS = ["atlas", "centaurus", "orion", "andromeda", "meow"];

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

/* ── Playback watchdog (through the real handler) ─────────────────────── */
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

async function play(kind) {
  let lastErr = "no server attempted";
  for (const server of SERVERS) {
    const body = { action: "resolvezxc", type: kind, id: kind === "movie" ? PROBE.movie : PROBE.tv, server };
    if (kind === "tv") { body.season = PROBE.season; body.episode = PROBE.episode; }
    const res = makeRes();
    let payload;
    try {
      await streamHandler({ method: "POST", body, headers: { "x-forwarded-for": "203.0.113.9" } }, res);
      payload = typeof res.body === "string" ? JSON.parse(res.body) : res.body;
    } catch (error) {
      lastErr = `${server}: threw ${error.message}`;
      continue;
    }
    if (payload?.ok === true) {
      return {
        ok: true,
        server,
        variants: Array.isArray(payload.variants) ? payload.variants.length : 0,
        audio: Array.isArray(payload.audioTracks) ? payload.audioTracks.length : 0,
      };
    }
    lastErr = `${server}: ${payload?.code || "?"} ${payload?.error || ""}`;
  }
  return { ok: false, error: lastErr };
}

export default async function syncContract(req, res) {
  if (!authorized(req)) {
    send(res, 401, { ok: false, error: "unauthorized", code: "unauthorized" });
    return;
  }

  const dry = /[?&]dry=1\b/.test(req.url || "");
  const seed = zxcContractSeed();

  let derived = null;
  let deriveError = null;
  try {
    derived = await fetchLiveZxcContract();
  } catch (error) {
    deriveError = error?.message || String(error);
    logWarn("api", "sync-contract: could not derive live contract", { message: deriveError });
  }
  const drifted = !!(derived && !zxcContractEquals(seed, derived));

  let pushed = false;
  let commitSha = null;
  let pushError = null;

  if (drifted && !dry) {
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
        }
      } catch (error) {
        pushError = error?.message || String(error);
        logWarn("api", "sync-contract: commit failed", { message: pushError });
      }
    }
  }

  const verification = await verifyPlayback();

  send(res, 200, {
    ok: (!drifted || pushed) && verification.movie.ok && verification.series.ok,
    dry,
    drifted,
    pushed,
    commit: commitSha,
    pushError,
    deriveError,
    seed,
    derived,
    verification,
  });
}

async function verifyPlayback() {
  const movie = await play("movie");
  const series = await play("tv");
  return { movie, series };
}
