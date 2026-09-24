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
const CHROME_PATH =
  process.env.CHROME_PATH ||
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "/usr/bin/google-chrome");

let browser = null;
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

async function getBrowser() {
  if (browser?.connected) return browser;
  try { await browser?.close(); } catch { /* already dead */ }
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
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
  try {
    await page.setViewport({ width: 1366, height: 768 });
    const cdp = await page.createCDPSession();
    await cdp.send("Network.enable");
    let playlistUrl = null;
    const seen = (e) => {
      if (!playlistUrl && e.request.url.includes("/api/playlist/")) playlistUrl = e.request.url;
    };
    cdp.on("Network.requestWillBeSent", seen);
    await page.goto(buildEmbedUrl({ type, id, season, episode }), {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_MS,
    });
    // A real click: some titles park on click-to-play, which is also when the
    // player starts fetching upstreams.
    await page.evaluate(() => {
      const v = document.querySelector("video");
      if (v) { try { v.click(); } catch { /* player decides */ } }
    }).catch(() => {});
    const start = Date.now();
    while (!playlistUrl && Date.now() - start < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!playlistUrl) throw new Error("player never requested a playlist (timeout)");
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
  try {
    const playlistUrl = await resolvePlaylist({
      type,
      id,
      season: body.season,
      episode: body.episode,
    });
    send(200, { ok: true, playlistUrl });
  } catch (error) {
    send(200, { ok: false, error: error?.message || "resolve failed", code: "no-source" });
  } finally {
    release();
  }
});

server.listen(PORT, () => {
  console.log(`cinesrc-resolver listening on :${PORT} (chrome: ${CHROME_PATH})`);
});
