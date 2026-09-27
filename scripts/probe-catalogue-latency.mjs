/* Where does the time actually go? Times every catalogue path the app loads,
 * warm (edge-cached) and cold (cache-busted -> forces a Vercel origin fetch).
 * Run: node scripts/probe-catalogue-latency.mjs                              */

const API_BASE = process.env.STREAMLY_API_BASE || "https://streamlyvercelin.vercel.app";
const PATHS = [
  ["/trending/all/week", "Home rail 1"],
  ["/movie/now_playing", "Home rail 2"],
  ["/movie/top_rated", "Home rail 3"],
  ["/tv/airing_today", "Home rail 4"],
  ["/search/multi", "Search"],
  ["/movie/27205", "Details"],
  ["/movie/27205/credits", "Details: cast"],
  ["/tv/1399/season/1", "Details: episodes"],
];

async function time(path, params = {}, label = "") {
  const q = new URLSearchParams({ path, language: "en", ...params });
  const t0 = performance.now();
  const res = await fetch(`${API_BASE}/api/tmdb?${q.toString()}`);
  const text = await res.text();
  const ms = Math.round(performance.now() - t0);
  const age = res.headers.get("x-vercel-cache") || res.headers.get("cf-cache-status") || "-";
  const s = `${String(ms).padStart(6)}ms  http=${res.status}  ${String(text.length).padStart(7)}B  cache=${age.padEnd(8)} ${label || path}`;
  console.log(s);
  return ms;
}

console.log(`origin: ${API_BASE}\n`);
console.log("=== COLD (unique param -> cache miss -> Vercel lambda -> TMDB upstream)");
const cold = [];
for (const [p, label] of PATHS) cold.push(await time(p, { cb: Math.random().toString(36).slice(2) }, label));

console.log("\n=== WARM (same URL again -> edge cache hit)");
const warm = [];
for (const [p, label] of PATHS) warm.push(await time(p, {}, label));

const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
const max = (a) => Math.max(...a);
console.log(`\ncold  avg=${avg(cold)}ms  max=${max(cold)}ms`);
console.log(`warm  avg=${avg(warm)}ms  max=${max(warm)}ms`);

console.log("\n=== 4 rails in parallel, cold (what a cold Home mount costs)");
const t0 = performance.now();
await Promise.all(
  PATHS.slice(0, 4).map(([p]) =>
    fetch(`${API_BASE}/api/tmdb?${new URLSearchParams({ path: p, language: "en", cb: Math.random().toString(36).slice(2) })}`),
  ),
);
console.log(`parallel cold Home: ${Math.round(performance.now() - t0)}ms`);
