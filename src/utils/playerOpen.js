/**
 * Single source of truth for "is a player overlay open right now?"
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * Both consumers used to detect the player by searching for provider IFRAMES:
 *
 *   'iframe[src*="cinesrc"], iframe[src*="vidlink"], iframe[src*="vidsrc"], …'
 *
 * That only ever matched the TRAILER path. The native HLS player renders a
 * `<video>` element and ZERO iframes, so for every actual stream the predicate
 * was permanently false. The two visible consequences:
 *
 *   - `BackToTop` stayed on screen, floating over and clickable on top of
 *     playback, so clicking it scrolled the page behind the player.
 *   - `GlobalShortcuts` opened its modal BEHIND the player (z-index 9999 vs the
 *     player's 99999), so Shift+? appeared to do nothing — while `isOpen` was
 *     now true, and its handler `preventDefault()`s on the next Escape.
 *
 * The string was also duplicated in two files, so any fix had to be applied
 * twice and the copies could drift.
 *
 * ── How it works now ────────────────────────────────────────────────────────
 * The overlay that actually owns the player stamps an attribute on itself. Any
 * number of consumers can read it, and adding a new one is a single import
 * rather than a new copy of a selector.
 *
 * The attribute is set by the overlay OWNER (TitleDetailsPage for the current
 * player, and later PlayerShell for v2) — never by the consumers — so there is
 * exactly one writer and no possibility of two disagreeing.
 */

/** Attribute the player overlay stamps on itself while it is mounted. */
export const PLAYER_OPEN_ATTR = "data-player-open";

/** Selector matching an open player overlay. */
export const PLAYER_OPEN_SELECTOR = `[${PLAYER_OPEN_ATTR}="true"]`;

/**
 * @param {ParentNode|null} [root] injection seam for tests; defaults to document
 *   ONLY when the argument is omitted. Passing an explicit `null` is respected
 *   and returns false — `root ?? document` would have made `null` mean "search
 *   the whole document", which is the opposite of what a caller passing a null
 *   container intends, and is the kind of ambiguity that turns into a bug that
 *   only reproduces on one page.
 * @returns {boolean}
 */
export function isPlayerOpen(root) {
  const scope =
    root === undefined
      ? typeof document !== "undefined"
        ? document
        : null
      : root;
  if (!scope || typeof scope.querySelector !== "function") return false;
  try {
    return Boolean(scope.querySelector(PLAYER_OPEN_SELECTOR));
  } catch {
    // A malformed selector must not break a keydown handler or a scroll tick.
    return false;
  }
}

/**
 * Props to spread onto the overlay element. Kept here so the attribute name and
 * its value cannot drift from the selector above.
 *
 * React-only, deliberately. JSX special-cases `data-*` and routes them through
 * `setAttribute`, so `{...playerOpenAttrs}` on a <motion.div> works. The
 * equivalent vanilla call does NOT:
 *
 *   Object.assign(el, playerOpenAttrs);        // sets a JS property, ignored
 *   el.setAttribute("data-player-open", "1"); // the real thing
 *
 * `Object.assign` on a DOM node silently creates an expando property, the
 * attribute is never set, and every reader goes back to "always false" — the
 * exact bug this module exists to remove. Asserted in playerOpen.test.js.
 */
export const playerOpenAttrs = { [PLAYER_OPEN_ATTR]: "true" };
