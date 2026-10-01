import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/* PLAYER V2 structural guards (task.md 1.2 / 1.8 / 1.6).
 *
 * These are the cheap invariants that protect the rollout from silent damage.
 * Each one exists because the failure it prevents is invisible in review:
 *
 *  1. v2 must never import components/Loader.jsx. That spinner is the app's
 *     page/inline/button/global loader and has its own API; pulling it into the
 *     player would make a phase change re-render a global loader, or ship a
 *     global import into a leaf component. Nothing would error — it would just
 *     be wrong.
 *  2. v2 must not grow an unprefixed CSS selector, because during the flagged
 *     rollout player.css is still live and an unprefixed rule could restyle the
 *     OLD player. (Also covered in playerV2Style.test.js; asserted here too so
 *     the two structural rules sit together.)
 *  3. v2 files must not reintroduce the retired Netflix-HUD components.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../");
const V2 = resolve(SRC, "components/player/v2");

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

/* Skip node_modules and non-source trees: this walks the repo, and the only
 * thing under test is src/components/player/v2. */
function v2SourceFiles() {
  return walk(V2).filter((f) => /\.(jsx?|mjs|cjs)$/.test(f));
}

describe("player/v2 — structural guards", () => {
  it("exists and has content", () => {
    /* Scoped to ANY file, not just JS. Right now v2/ holds only player.css and
     * INVENTORY.md — the JS (PlayerShell) is Phase 2 — and scoping this to
     * source files would fail while the directory is legitimately mid-build.
     *
     * The import guards below therefore no-op until JS lands. That is not a
     * loophole being exploited: they run over every JS file that exists, so the
     * moment PlayerShell arrives they are live, and deleting v2/ entirely would
     * fail HERE rather than silently disarm them. */
    expect(walk(V2).length).toBeGreaterThan(0);
    expect(readFileSync(resolve(V2, "player.css"), "utf8").length).toBeGreaterThan(0);
  });

  it("never imports components/Loader.jsx (task.md 1.2)", () => {
    const offenders = [];
    for (const file of v2SourceFiles()) {
      const src = readFileSync(file, "utf8");
      // Match an import of Loader from any depth, including the extensionless
      // `../Loader` form the repo uses.
      const re = /import\s+(?:[\w*\s{},]+)\s*from\s*["'][^"']*\bLoader(?:\.jsx)?["']/g;
      for (const m of src.matchAll(re)) {
        offenders.push(`${relative(SRC, file)}: ${m[0]}`);
      }
    }
    expect(
      offenders,
      `v2 must not import the app-wide Loader (task.md 1.2):\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("does not import the retired Netflix-HUD chrome (task.md 1.3)", () => {
    /* Three of these eight are DELETED, not merely retired: ArcRing,
       LoadingArc and NetflixBrightnessHUD had zero render sites repo-wide
       (reachable only through the player/index.js barrel), so they were
       removed outright. The other five still render inside the legacy player
       and die with it in Phase 6. Both groups are listed here because the rule
       is the same: v2 imports none of them. */
    const retired = [
      "ArcRing",
      "LoadingArc",
      "NetflixVolumeHUD",
      "NetflixBrightnessHUD",
      "NetflixAspectHUD",
      "NetflixSeekHUD",
      "NetflixPlayPauseHUD",
      "NetflixHold2xHUD",
    ];
    const offenders = [];
    for (const file of v2SourceFiles()) {
      const src = readFileSync(file, "utf8");
      for (const name of retired) {
        if (src.includes(`"../${name}"`) || src.includes(`"./${name}"`)) {
          offenders.push(`${relative(SRC, file)} imports ${name}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("has physically deleted the three dead HUD components, not just stopped importing them", () => {
    /* "v2 does not import it" and "the file is gone" are different claims, and
       only the second one is what keeps dead chrome from creeping back. These
       three were verified unreferenced before deletion: no JSX render site in
       NativePlayerView.jsx or anywhere else in src/. */
    const deleted = ["ArcRing", "LoadingArc", "NetflixBrightnessHUD"];
    const stillPresent = deleted.filter((name) => {
      try {
        return statSync(resolve(SRC, "components/player", `${name}.jsx`)).isFile();
      } catch {
        return false;
      }
    });
    expect(
      stillPresent,
      `expected deleted: ${stillPresent.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the five HUDs the legacy player still renders", () => {
    /* The counterweight to the test above, so a future "tidy up" pass cannot
       delete these on the reasoning that v2 never imports them. They have live
       render sites inside NativePlayerView.jsx; the legacy player is still
       reachable behind VITE_PLAYER_LEGACY, and removing its HUDs would break the
       rollback path rather than clean it up. */
    const required = [
      "NetflixVolumeHUD",
      "NetflixAspectHUD",
      "NetflixSeekHUD",
      "NetflixPlayPauseHUD",
      "NetflixHold2xHUD",
    ];
    const missing = required.filter((name) => {
      try {
        return !statSync(resolve(SRC, "components/player", `${name}.jsx`)).isFile();
      } catch {
        return true;
      }
    });
    expect(missing, `unexpectedly missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps v2 under the components/player/v2 path, never beside the legacy chrome", () => {
    // The Phase 6 purge deletes player/*.jsx + player/index.js. A v2 file
    // written one level up would be inside that blast radius.
    // Normalised to "/" because relative() returns "components\player\v2\..."
    // on Windows and the comparison would fail on separators, not on content.
    for (const file of v2SourceFiles()) {
      expect(relative(SRC, file).split(sep).join("/")).toMatch(/^components\/player\/v2\//);
    }
  });
});

describe("no stale pointer to the pre-rename player component (task.md 1.8)", () => {
  it("has no reference to the retired component name anywhere in src", () => {
    /* Built from parts so this file does not itself contain the literal — a
     * guard that flags its own source is a guard that has to be weakened later. */
    const NEEDLE = ["Custom", "Video", "Player"].join("");
    const offenders = [];
    for (const file of walk(resolve(SRC)).filter((f) => /\.(jsx?|css|md)$/.test(f))) {
      if (file.includes(`${sep}__tests__${sep}`)) continue;
      if (readFileSync(file, "utf8").includes(NEEDLE)) {
        offenders.push(relative(SRC, file));
      }
    }
    // All 4 real occurrences were comments, not code — leftovers from an old
    // rename. Harmless at runtime, actively misleading to the next reader, and
    // the reason prd.md pointed at a file that does not exist.
    expect(offenders, `stale references: ${offenders.join(", ")}`).toEqual([]);
  });
  it("carries no frozen input-capability constant", () => {
    // `NativePlayerView.jsx:140-143` computed `IS_TOUCH` once at module load and
    // 37 sites read that frozen boolean - the exact defect 3.3-3.4 replace. The
    // failure it caused is silent (a hybrid device renders the wrong layout and
    // nothing throws), so this needs a scan rather than a review.
    //
    // `inputCapability.js` is allowed to READ the queries; what must not exist
    // is a `.matches` snapshotted into a variable, which is what freezes the
    // answer at import time.
    //
    // The pattern spans lines on purpose. The legacy version is written
    // multi-line (`NativePlayerView.jsx:140-143`), and a line-by-line scan
    // silently misses it — a guard that only catches the formatting nobody uses.
    //
    // The paren handling is not incidental: media queries CONTAIN parentheses
    // (`"(hover: none), (pointer: coarse)"`), so a `[^)]*` argument pattern does
    // not match the very line it is meant to catch. Verified against both the
    // legacy text and the two sanctioned reads below.
    //
    // It is deliberately a little over-broad: a `const` snapshot inside a
    // function is flagged too, which is fine — `readMediaCapabilities()` is the
    // sanctioned way to take that reading, and it is one import away.
    const FROZEN =
      /^[ \t]*(?:export\s+)?const\s+\w+\s*=\s*[^;]*?matchMedia\((?:[^()"']|"[^"]*"|'[^']*')*\)\.matches/gm;
    const offenders = [];
    for (const file of walk(V2).filter((f) => /\.(jsx?)$/.test(f))) {
      const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of src.matchAll(FROZEN)) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${relative(SRC, file)}:${line} ${m[0].split("\n")[0].trim()}`);
      }
    }
    expect(
      offenders,
      `module-scope matchMedia().matches in v2:\n${offenders.join("\n")}\n` +
        `Use useInputCapability() - capability must be live.`,
    ).toEqual([]);
  });
});