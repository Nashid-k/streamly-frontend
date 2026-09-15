#!/usr/bin/env node
/**
 * cinejoy-rules.mjs — query the extracted Cinejoy CSS like a REPL.
 *
 * Prints every minified CSS rule whose text contains <substring>, with the
 * owning file and byte offset so you can jump straight to the exact style
 * for any class/variable/animation when mirroring a page.
 *
 * Usage:
 *   node scripts/cinejoy-rules.mjs spotlight-badge
 *   node scripts/cinejoy-rules.mjs dropdown  --all
 *   node scripts/cinejoy-rules.mjs pill-transition --all
 *   node scripts/cinejoy-rules.mjs @media --global  (too noisy — use grep)
 *
 * Flags:
 *   --global   search only the global design-system chunk (0.*.css)
 *   --all      search every CSS file (default: global + the per-component
 *              files whose entry you provide)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS_DIR = path.join(ROOT, "docs", "cinejoy-reference", "css");

const args = process.argv.slice(2);
const needle = args.filter((a) => !a.startsWith("--"))[0];
if (!needle) {
  console.error("Usage: node scripts/cinejoy-rules.mjs <substring> [--global|--all] [extra-files...]");
  process.exit(1);
}
const all = args.includes("--all");
const globalOnly = args.includes("--global");
const extra = args.filter((a) => !a.startsWith("--") && a !== needle);

let files = [];
if (globalOnly) {
  files = fs.readdirSync(CSS_DIR).filter((n) => /^0\.\w+\.css$/.test(n));
} else {
  files = fs.readdirSync(CSS_DIR).filter((n) => n.endsWith(".css"));
  if (!all) {
    const picked = new Set([...["0.ugGWN4mw.css"], ...extra]);
    files = files.filter((n) => picked.has(n));
  }
}

const hits = [];
for (const file of files) {
  const css = fs.readFileSync(path.join(CSS_DIR, file), "utf8");
  let i = 0;
  while (i < css.length) {
    const end = css.indexOf("}", i);
    if (end === -1) break;
    const block = css.slice(i, end + 1);
    const trimmed = block.trim();
    if (trimmed.includes(needle) && trimmed.includes("{")) {
      hits.push({ file, offset: i, block: trimmed });
    }
    i = end + 1;
  }
}

console.log(`\n${hits.length} rule(s) matching "${needle}"\n`);
for (const h of hits.slice(0, 60)) {
  console.log(`── ${h.file} @${h.offset} ──`);
  console.log(h.block);
  console.log("");
}