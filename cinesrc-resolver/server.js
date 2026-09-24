// cinesrc-resolver/server.js — mint-on-demand CineSrc playlist URLs.
//
// CineSrc's stream tokens are fingerprint-bound (PoW + browser surface), so no
// serverless function can mint them. This tiny service runs real Chrome,
// loads the embed, watches CDP network traffic for the first
// `/api/playlist/{id}` request the player makes, and returns it. The caller
// (api/downloadify.js action "resolvecinesrc") then walks master -> variants
// -> segments exactly like any other HLS source.
//
//   POST /resolve  { type: "movie"|"tv", id: "<tmdb>", season?, episode? }
//     -> { ok: true, playlistUrl } | { ok: false, error, code }
//
//   GET /healthz -> { ok: true }
//
// Env: PORT (default 3100), CHROME_PATH (default OS guess below),
// RESOLVE_TIMEOUT_MS (default 60000), MAX_PAGES (default 2).
// Operate behind a firewall/VPN — there is no auth; the URL itself is the
// secret (set CINESRC_RESOLVER_URL on the Vercel project, never in git).

import http from "node:http";
import puppeteer from "puppeteer-core";

const PORT = Number(process.env.PORT || 3100);
const TIMEOUT_MS = Number(process.env.RESOLVE_TIMEOUT_MS || 60000);
const MAX_PAGES = Math.max(1, Number(process.env.MAX_PAGES || 2));
// Serialize resolutions past MAX_PAGES concurrent pages (each page is a full
// renderer; bounding concurrency bounds RAM/CPU on small hosts).
let inflight = 0;
const waiters = [];
async function acquire() {
  if (inflight < MAX_PAGES) {
    inflight += 1;
    return;
  }
  await new Promise((resolve) => waiters.push(resolve));
  inflight += 1;
}
function release() {
  inflight = Math.max(0, inflight - 1);
  const next = waiters.shift();
  if (next) next();
}

const CHROME_PATH =
  process.env.CHROME_PATH ||
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "/usr/bin/google-chrome");

let browser = null;
let mints = 0;
// Free-tier containers have no swap and hard-kill (OOMKilled) when a mint's
// PoW spike crosses the cgroup memory ceiling — the worst time to die is
// MID-mint (the caller gets a dead connection and the download shows a lie).
// So we read the container's own memory figures from inside and recycle the
// whole browser (which holds ~80% of our RSS) the moment headroom gets thin,
// instead of letting the kernel pick the kill point for us.
const MEM_HIGH = Number(process.env.MEM_HIGH || 0.75);
const RECLAIM_IDLE_MS = Number(process.env.RECLAIM_IDLE_MS || 90000);
const cgroupPath = async (name) => {
  try {
    const { readFile } = await import("node:fs/promises");
    const s = (await readFile(name, "utf8")).trim();
    return Number(s.replace(/\s+/g, "")) || 0;
  } catch { return 0; }
};
const memUsage = async () => {
  const current = await cgroupPath("/sys/fs/cgroup/memory.current");
  const max = await cgroupPath("/sys/fs/cgroup/memory.max");
  if (current > 0 && max > 0 && isFinite(max)) return current / max;
  const used = await cgroupPath("/sys/fs/cgroup/memory/memory.usage_in_bytes");
  const lim = await cgroupPath("/sys/fs/cgroup/memory/memory.limit_in_bytes");
  if (used > 0 && lim > 0 && isFinite(lim)) return used / lim;
  return 0;
};
async function trimBrowser() {
  try { await browser?.close(); } catch { /* already dead */ }
  browser = null;
}
async function ensureHeadroom() {
  if (await memUsage() > MEM_HIGH) await trimBrowser();
}
let lastMintAt = 0;
setInterval(async () => {
  const usage = await memUsage().catch(() => 0);
  if (usage > MEM_HIGH && Date.now() - lastMintAt > RECLAIM_IDLE_MS) {
    console.log(`[trim] idle reclaim mem=${Math.round(usage * 100)}%`);
    await trimBrowser();
  }
}, 30000).unref();
async function getBrowser() {
  if (browser?.connected) return browser;
  await trimBrowser();
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--renderer-process-limit=1",
      "--js-flags=--max-old-space-size=256",
    ],
  });
  return browser;
}

function buildEmbedUrl({ type, id, season, episode }) {
  const kind = type === "tv" ? "tv" : "movie";
  if (kind === "tv") {
    const s = season ?? 1;
    const e = episode ?? 1;
    return `https://cinesrc.st/embed/tv/${id}?s=${encodeURIComponent(s)}&e=${encodeURIComponent(e)}`;
  }
  return `https://cinesrc.st/embed/movie/${id}`;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 64 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

async function resolvePlaylist({ type, id, season, episode }) {
  const b = await getBrowser();
  const page = await b.newPage();
  const requests = [];
  let playlistUrl = null;
  try {
    await page.setViewport({ width: 800, height: 450 });
    const cdp = await page.createCDPSession();
    await cdp.send("Network.enable");
    const seen = (e) => {
      const u = e.request.url;
      if (requests.length < 50) requests.push(u);
      if (!playlistUrl && u.includes("/api/playlist/")) playlistUrl = u;
    };
    cdp.on("Network.requestWillBeSent", seen);
    await page.goto(buildEmbedUrl({ type, id, season, episode }), {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_MS,
    });
    await page.evaluate(() => {
      const v = document.querySelector("video");
      if (v) { try { v.click(); } catch { /* player decides */ } }
    }).catch(() => {});
    const start = Date.now();
    while (!playlistUrl && Date.now() - start < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!playlistUrl) {
      const diag = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        hasVideo: !!document.querySelector("video"),
        bodyText: (document.body?.innerText || "").slice(0, 300).replace(/\s+/g, " ").trim(),
      })).catch(() => ({}));
      const issue = new Error("player never requested a playlist (timeout)");
      issue.diag = { ...diag, requests: requests.filter((u) => !u.endsWith(".js") && !u.endsWith(".css")).slice(-15) };
      throw issue;
    }
    return playlistUrl;
  } finally {
    try { await page.close(); } catch { /* already gone */ }
  }
}

const server = http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/healthz") {
    send(200, { ok: true });
    return;
  }
  if (req.method !== "POST" || req.url !== "/resolve") {
    send(404, { ok: false, error: "not found", code: "bad-route" });
    return;
  }
  const body = await readBody(req);
  const type = body.type === "tv" ? "tv" : "movie";
  const id = String(body.id || "").trim();
  if (!/^\d{1,12}$/.test(id)) {
    send(400, { ok: false, error: "Invalid TMDB id", code: "bad-id" });
    return;
  }
  await acquire();
  const started = Date.now();
  try {
    await ensureHeadroom().catch(() => {});
    const playlistUrl = await resolvePlaylist({
      type,
      id,
      season: body.season,
      episode: body.episode,
    });
    const usage = await memUsage().catch(() => 0);
    lastMintAt = Date.now();
    mints += 1;
    console.log(`[mint] ok in ${Date.now() - started}ms mem=${Math.round(usage * 100)}% mints=${mints}`);
    send(200, { ok: true, playlistUrl });
    if (mints >= 3 || usage > MEM_HIGH) {
      console.log(`[trim] post-mint mem=${Math.round(usage * 100)}% mints=${mints}`);
      await trimBrowser();
      mints = 0;
    }
  } catch (error) {
    lastMintAt = Date.now();
    console.log(`[mint] fail in ${Date.now() - started}ms code=${error?.code || "err"} msg=${error?.message || "unknown"}`);
    send(200, {
      ok: false,
      error: error?.message || "resolve failed",
      code: "no-source",
      diag: error?.diag,
    });
  } finally {
    release();
  }
});

server.listen(PORT, () => {
  console.log(`cinesrc-resolver listening on :${PORT} (chrome: ${CHROME_PATH})`);
});
