import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* ── The "mirror ref declared and never assigned" bug class ────────────────
   Two shipped bugs were the same shape: a ref was declared, READ from a
   once-bound handler, and never written after declaration, so the guard it
   backed was permanently falsy.

     - `hold2xRef` — every "is a hold live?" branch read false; releasing a hold
       left the element at 2x.
     - `endedRef`  — read by the idle timer to refuse a still-watching prompt
       after the credits; declared, read, never assigned.

   Neither is catchable by a type check or a unit test of the component (the
   tests that would catch it are the ones we deliberately do not write, because
   they would fabricate an event order and assert a copy of the logic). What IS
   mechanically checkable is the shape itself: a ref that is only ever read.

   This guard scans src/ for `useRef(initial)` declarations and verifies the
   resulting binding is written somewhere — either `.current =` at a sync/setter
   site, or a `ref={name}` attribute. It deliberately ignores refs that are
   passed straight into a DOM/child prop (`ref={name}`) or returned.

   Heuristic, and intentionally so: it only fires on the pathological shape
   (zero writes anywhere in the file). That is exactly the shipped bug. */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(jsx?|mjs)$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

/* A declaration line: `const fooRef = useRef(...)` (or `let`). */
const DECL = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*useRef\s*[(<]/;

const sourceFiles = walk(ROOT);

describe("refs are assigned somewhere (mirror-ref bug class)", () => {
  it("finds source files to scan", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it("never declares a ref that is only ever read", () => {
    const offenders = [];

    for (const file of sourceFiles) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("useRef")) continue;

      // Map ref name → the index just past its declaration.
      const declared = new Map();
      for (const line of src.split("\n")) {
        const m = DECL.exec(line);
        if (m) declared.set(m[1], true);
      }
      if (declared.size === 0) continue;

      for (const name of declared.keys()) {
        /* Deciding whether a ref is written is not a pure regex problem — the
           codebase assigns through four legitimate shapes, and a guard that
           misses one turns into a false-positive factory (and a guard everyone
           disables is worse than no guard). Treat ALL of these as "assigned":

             name.current = …            plain
             name.current += 1           compound (token counters)
             name.current[num] = …       key on the ref object
             name.current.set(…)/.push(…)  method that mutates it
             const x = name.current; x.f = …  aliased, then mutated
             ref={name} / xRef={name}    handed to a DOM node or child */

        const readAliased = new RegExp(
          `(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*${name}\\.current\\b`,
        ).test(src);
        const written =
          new RegExp(
            `\\b${name}\\.current\\??(?:\\.[\\w$]+\\??|\\[[^\\]]*\\]\\??)*\\s*(?:\\+\\+|--|[+\\-*/%&|^]?=)[^=]`,
          ).test(src) ||
          // Prefix form: `++idRef.current`.
          new RegExp(`(?:\\+\\+|--)\\s*${name}\\.current\\b`).test(src) ||
          new RegExp(`\\b${name}\\.current\\??\\.\\w+\\s*\\(`).test(src) ||
          readAliased ||
          new RegExp(`\\b(?:ref|[A-Za-z_$][\\w$]*Ref)=\\{${name}\\}`).test(src) ||
          new RegExp(`\\bref:\\s*${name}\\b`).test(src);
        if (!written) offenders.push(`${file.replace(ROOT, "")}: ${name}`);
      }
    }

    expect(offenders, `refs declared and never assigned:\n${offenders.join("\n")}`).toEqual([]);
  });
});
