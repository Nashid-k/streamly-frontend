#!/usr/bin/env node
/**
 * fetch-cinejoy-css.mjs — repeatable CSS reverse-engineering harness.
 *
 * Cinejoy is a client-rendered SvelteKit app, so `curl` on any route returns
 * only a shell (no <link rel="stylesheet"> for the app). The real styles are
 * hashed static assets referenced by the JS build:
 *
 *   /_app/immutable/entry/app.<hash>.js      (app entry — imports the graph)
 *   /_app/immutable/assets/<Name>.<hash>.css (each Svelte component's CSS)
 *   /_app/immutable/chunks|nodes/*.js        (deeper chunks that own CSS)
 *
 * This harness:
 *   1. Fetches the shell HTML of each route (default: /, /movies, /series,
 *      /search, /watch, /film, /settings — every browsable page).
 *   2. Resolves the app-entry JS URL out of the shell.
 *   3. Crawls the JS module graph (BFS) collecting every referenced `.css`
 *      asset name — including CSS owned by on-demand chunks.
 *   4. Downloads every CSS asset into <out>/css and every shell into
 *      <out>/html, then writes an index.md that maps CSS files to the
 *      Svelte components (the base filename is the component name).
 *
 * Usage:
 *   node scripts/fetch-cinejoy-css.mjs [--out docs/cinejoy-reference] [--urls "a b c"]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}
const OUT_DIR = argValue("--out") || path.join(ROOT, "docs", "cinejoy-reference");
const urlsArg = argValue("--urls");
const ORIGIN = process.env.CINEJOY_ORIGIN || "https://cinejoy.to";

const DEFAULT_ROUTES = ["/", "/movies", "/series", "/search", "/watch", "/film", "/settings"];
const routes = urlsArg ? urlsArg.trim().split(/\s+/) : DEFAULT_ROUTES;

const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
      return await res.text();
    } catch (err) {
      if (attempt === 3) throw err;
      await wait(500 * attempt);
    }
  }
  return "";
}

// A SvelteKit asset reference inside an entry/chunk JS file:
//   "../assets/DiscoveryPage.DCzCrL7d.css"  or  "assets/Foo.css"
const CSS_REF = /(?:\.\.\/)?assets\/([A-Za-z0-9_.-]+\.css)/g;
// Relative JS imports inside entry/chunk files (SvelteKit layout):
//   "../chunks/BSYKIS4N.js"  /  "./chunks/X.js"  /  "../nodes/14.CDqjnFmv.js"
const JS_REF = /\.\.\/(chunks|nodes|entry)\/([A-Za-z0-9_.-]+\.js)/g;

const htmlDir = path.join(OUT_DIR, "html");
const cssDir = path.join(OUT_DIR, "css");
await fs.mkdir(htmlDir, { recursive: true });
await fs.mkdir(cssDir, { recursive: true });

const cssNames = new Set();
const seenJs = new Set();
const queue = [];
const jsQueue = [];

// 1. Shells per route + seed the JS graph from each shell.
for (const [i, route] of routes.entries()) {
  const label = `${i}-${route.replace(/[^a-zA-Z0-9-]/g, "-") || "root"}`;
  const html = await get(`${ORIGIN}${route}`);
  await fs.writeFile(path.join(htmlDir, `${label}.html`), html, "utf8");
  console.log(`[html] ${route} -> ${html.length} bytes`);

  const appMatch = html.match(/\/_app\/immutable\/entry\/app\.([A-Za-z0-9-]+)\.js/);
  if (appMatch) {
    const entry = `/entry/app.${appMatch[1]}.js`;
    if (!seenJs.has(entry)) {
      seenJs.add(entry);
      jsQueue.push(entry);
    }
  }
}

// 2+3. Crawl the module graph, collecting CSS assets and deeper chunks.
const resolvedAssetsNow = Promise.resolve();
const fetchCss = (name) => {
  if (cssNames.has(name)) return Promise.resolve();
  cssNames.add(name);
  return get(`${ORIGIN}/_app/immutable/assets/${name}`).then(
    (css) => fs.writeFile(path.join(cssDir, name), css, "utf8").then(() => console.log(`[css] ${name} (${css.length}b)`)),
  );
};

while (jsQueue.length) {
  const relPath = jsQueue.shift();
  const absUrl = `${ORIGIN}/_app/immutable${relPath}`;
  let js;
  try {
    js = await get(absUrl);
  } catch {
    console.warn(`[skip] failed to fetch ${absUrl}`);
    continue;
  }
  await resolvedAssetsNow;
  for (const [, name] of js.matchAll(CSS_REF)) await fetchCss(name);
  for (const [, dir, name] of js.matchAll(JS_REF)) {
    const key = `${dir}/${name}`;
    if (seenJs.has(key)) continue;
    seenJs.add(key);
    queue.push(key);
  }
  if (queue.length) {
    const next = queue.shift();
    jsQueue.push(`/${next}`);
  }
}

// 4. Summary index.
const files = (await fs.readdir(cssDir)).filter((n) => n.endsWith(".css"));
const sizes = await Promise.all(
  files.map(async (n) => {
    const st = await fs.stat(path.join(cssDir, n));
    return `| ${n} | ${Math.round(st.size / 1024)} KB |`;
  }),
);
const index = [
  "# Cinejoy CSS reference (auto-extracted)",
  "",
  `Origin: ${ORIGIN} · routes: ${routes.join(", ")} · generated: ${new Date().toISOString()}`,
  "",
  "## CSS assets",
  "",
  "| File | Size |",
  "| --- | ---: |",
  ...sizes,
  "",
  "## Notes",
  "",
  "- The base filename (before the first `.`) is the Svelte component that",
  "  owns the styles, e.g. `DiscoveryPage.*.css`, `MediaCard.*.css`.",
  "- The giant `0.*.css` chunk is the global/design-system CSS (theme tokens,",
  "  nav, hero, grids, responsive rules).",
  "- Class names are scoped with Svelte's `.svelte-<hash>` suffixes; rule",
  "  contents (colors, spacing, animation, media queries) port directly.",
  "- Theme token values (the `--theme-*` palette) are injected by app JS as",
  "  inline `element.style` — see the CSS variables in each `html/*.html`",
  "  dump from the running app.",
  "",
  "Re-run anytime: `node scripts/fetch-cinejoy-css.mjs`",
].join("\n");
await fs.writeFile(path.join(OUT_DIR, "index.md"), index, "utf8");
console.log(`\nDone. ${files.length} css files -> ${cssDir}\nindex -> ${path.join(OUT_DIR, "index.md")}`);