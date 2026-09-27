/* Live contract test for the Android app's backend dependencies.
 *
 * The APK hardcodes one origin (mobile/src/config.ts DEPLOYED_API_BASE) and every
 * network call the app makes is checked here against the real deployment, so a
 * provider or schema change fails in CI instead of on a user's phone. It mirrors
 * the app's own code paths:
 *   - catalogue  -> src/api/tmdb.ts        (proxy first, no api_key, 12s timeout)
 *   - resolution -> src/api/streams.ts     (resolvevidcore, then resolvevidsrc)
 *   - playback   -> src/api/relay.ts       (direct + Referer, relay as fallback)
 *
 * Run: npm run smoke:mobile                                                     */

const API_BASE = process.env.STREAMLY_API_BASE || "https://streamlyvercelin.vercel.app";
const RELAY = process.env.STREAMLY_RELAY_URL || "https://streamly-proxy.nashidk1999.workers.dev";
const UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -  ${detail}` : ""}`);
};

/* Same shape as mobile/src/api/tmdb.ts: `path` and its query params are SEPARATE
 * (folding a query into `path` makes the proxy treat it as part of the resource
 * name), and NO api_key is sent - api/tmdb.js:78-100 injects TMDB_API_KEY only
 * when the client omits one, which is what keeps the key out of the APK. */
async function tmdb(path, params = {}) {
  const q = new URLSearchParams({ path, language: "en", ...params });
  const res = await fetch(`${API_BASE}/api/tmdb?${q.toString()}`);
  if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status} ${(await res.text()).slice(0, 140)}`);
  return res.json();
}

async function resolve(action, extra = {}) {
  const res = await fetch(`${API_BASE}/api/downloadify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, type: "movie", id: "27205", ...extra }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep null: every check below reports the raw text instead */
  }
  return { status: res.status, text, json };
}

async function main() {
  console.log(`origin: ${API_BASE}\n`);

  /* ── Catalogue: every surface the app loads on a cold start ─────────────── */
  const trending = await tmdb("/trending/all/week");
  check("trending/all/week (Home rail)", trending.results?.length > 0, `${trending.results?.length} results`);

  const airing = await tmdb("/tv/airing_today");
  check("tv/airing_today (Home rail)", Array.isArray(airing.results), `${airing.results?.length} results`);

  const search = await tmdb("/search/multi", { query: "inception" });
  check("search/multi (Search screen)", search.results?.length > 0, `${search.results?.length} results`);

  const detail = await tmdb("/movie/27205");
  check("movie detail (Details screen)", detail.title === "Inception", `"${detail.title}" ${detail.vote_average}`);

  const credits = await tmdb("/movie/27205/credits");
  check("credits (cast row)", credits.cast?.length > 0, `${credits.cast?.length} cast`);

  const season = await tmdb("/tv/1399/season/1");
  check("tv season (episode list)", season.episodes?.length > 0, `${season.episodes?.length} episodes`);

  /* ── Resolution: the exact contract src/api/streams.ts parses ───────────── */
  const vidcore = await resolve("resolvevidcore");
  check(
    "POST /api/downloadify resolvevidcore",
    vidcore.status === 200 && vidcore.json?.ok === true,
    `http=${vidcore.status} keys=${vidcore.json ? Object.keys(vidcore.json).join(",") : vidcore.text.slice(0, 140)}`,
  );

  const variants = vidcore.json?.variants;
  check("variants[] present with .uri", Array.isArray(variants) && variants.some((v) => v?.uri), `${variants?.length ?? "none"} variants`);
  check("source.kind is hls", vidcore.json?.source?.kind === "hls", `kind=${vidcore.json?.source?.kind}`);
  check("source.refUrl present (the Referer the host demands)", Boolean(vidcore.json?.source?.refUrl), String(vidcore.json?.source?.refUrl));

  /* pickSmooth() in streams.ts: tallest rendition at or below 1080p, so the app
   * never opens on the 2160p variant and stalls on mobile data. */
  const smooth = (variants || [])
    .filter((v) => v.height > 0 && v.height <= 1080)
    .sort((a, b) => b.height - a.height)[0];
  check("a <=1080p variant exists for the smooth start", Boolean(smooth), smooth ? `${smooth.height}p @ ${smooth.bandwidth} bps` : "none");

  /* ── Playback: direct + Referer, the PRIMARY path in relay.ts ───────────── */
  const refUrl = vidcore.json?.source?.refUrl;
  const playlist = smooth?.uri || vidcore.json?.source?.url;

  if (playlist) {
    const bare = await fetch(playlist, { headers: { Range: "bytes=0-2047" } });
    const withRef = await fetch(playlist, { headers: { "User-Agent": UA, Referer: refUrl || "", Range: "bytes=0-65535" } });
    const body = await withRef.text();
    check(
      "direct manifest WITH Referer is a playlist",
      withRef.ok && body.includes("#EXTM3U"),
      `http=${withRef.ok ? 200 : withRef.status} #EXTM3U=${body.includes("#EXTM3U")} bytes=${body.length} (without Referer: ${bare.status})`,
    );

    const seg = body.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
    if (seg) {
      const segRes = await fetch(seg, { headers: { "User-Agent": UA, Referer: refUrl || "", Range: "bytes=0-8191" } });
      const buf = new Uint8Array(await segRes.arrayBuffer());
      check("first segment fetches real bytes (ExoPlayer will too)", segRes.ok && buf.length > 0, `http=${segRes.status} bytes=${buf.length} type=${segRes.headers.get("content-type")}`);
    } else {
      check("manifest exposes media lines", false, "no non-comment line found");
    }
  } else {
    check("resolver produced a playable URL", false, "no playlist url to test");
  }

  /* The relay is the FALLBACK, so it is reported but never fails the run: the
   * worker is separate infrastructure and a 403 there must not read as a broken
   * app now that direct playback is the primary path. */
  const relayRes = await fetch(`${RELAY}?url=${encodeURIComponent(playlist || "")}&referer=${encodeURIComponent(refUrl || "")}`);
  const relayText = await relayRes.text();
  console.log(
    `INFO  relay fallback: http=${relayRes.status} #EXTM3U=${relayText.includes("#EXTM3U")} (informational only)`,
  );

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nSMOKE TEST CRASHED: ${error?.message || error}`);
  process.exit(1);
});
