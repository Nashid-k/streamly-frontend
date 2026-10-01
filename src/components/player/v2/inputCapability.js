/* What kind of input the viewer is actually using, right now (task.md 3.3-3.4).
 *
 * ── Why this is a module and not a hook ──────────────────────────────────────
 * The old player computed `IS_TOUCH` once at module load
 * (`NativePlayerView.jsx:140-143`) and read that frozen boolean in 37 places.
 * Three things follow from that, and all three are bugs people actually hit:
 *
 *  1. A Surface, touchscreen laptop or iPad+keyboard is not one or the other. It
 *     is fine-pointer AND coarse-pointer, and which one is right depends on what
 *     the viewer did five seconds ago.
 *  2. It is answered before anyone has touched anything, so the very first
 *     interaction is the one most likely to be mis-classified.
 *  3. Nothing re-reads it. Plug in a mouse and the player keeps drawing thumb
 *     zones; detach the keyboard and it keeps drawing hover states.
 *
 * So this module is PURE — it turns a set of facts into one answer, with no
 * globals and no listeners — and `useInputCapability` owns the subscription. That
 * split is what lets every branch below be asserted in jsdom, where `matchMedia`
 * always answers `false` and would otherwise hide the whole design.
 */

/** The two answers the layout cares about. */
export const INPUT = {
  FINE: "fine",
  COARSE: "coarse",
};

/**
 * The queries that get watched.
 *
 * `hover: none` and `pointer: coarse` are watched separately rather than as the
 * old comma-joined `(hover: none), (pointer: coarse)`, because a comma is an OR
 * and these are independent facts: a stylus reports `hover: hover` with
 * `pointer: fine`, and an iPad with a trackpad reports `coarse` with `hover`.
 * Collapsing them to an OR is what made the frozen constant wrong on exactly the
 * devices worth getting right.
 */
export const MEDIA_QUERIES = {
  canHover: "(hover: hover)",
  hasFine: "(pointer: fine)",
  hasCoarse: "(pointer: coarse)",
};

/** Pointer types that mean "precise input", from `pointerdown.pointerType`. */
const PRECISE_POINTERS = new Set(["mouse", "pen"]);

/**
 * Classify input from a set of facts.
 *
 * Precedence, and why:
 *  1. The most recent real interaction wins. It is the strongest evidence there
 *     is, and it is the only rule that can move a hybrid device in either
 *     direction.
 *  2. Otherwise `coarse` without `fine` means a genuinely touch-only device.
 *  3. Otherwise fine. Both-true (hybrid, nothing touched yet) and both-false
 *     (unknown environment) both default to fine, which is the desktop layout and
 *     matches the old `IS_TOUCH` default of `false`.
 *
 * @param {object} facts
 * @param {boolean} [facts.hasFine]
 * @param {boolean} [facts.hasCoarse]
 * @param {string|null} [facts.lastPointerType] from the last `pointerdown`
 * @param {boolean} [facts.canHover] accepted but deliberately NOT used here.
 *   Hover and pointer precision are independent (`hover: hover` with
 *   `pointer: coarse` is a real combination), and collapsing them is how the old
 *   frozen boolean got hybrid devices wrong. The hook exposes `canHover`
 *   separately so a component can ask the precise question.
 * @returns {"fine"|"coarse"}
 */
export function classifyInput({ hasFine, hasCoarse, lastPointerType } = {}) {
  if (lastPointerType === "touch") return INPUT.COARSE;
  if (PRECISE_POINTERS.has(lastPointerType)) return INPUT.FINE;
  if (hasCoarse && !hasFine) return INPUT.COARSE;
  return INPUT.FINE;
}

/**
 * Read the three queries once.
 *
 * Returns all-`false` when there is no `window` or no `matchMedia` (SSR, or a
 * test environment that stubs one but not the other). That is not a silent
 * failure: `classifyInput` maps it to FINE, the same answer the old frozen
 * boolean gave on a desktop, and the reason is logged by the hook.
 */
export function readMediaCapabilities(win = typeof window !== "undefined" ? window : null) {
  const out = { canHover: false, hasFine: false, hasCoarse: false };
  if (!win || typeof win.matchMedia !== "function") return out;
  for (const key of Object.keys(MEDIA_QUERIES)) {
    try {
      out[key] = Boolean(win.matchMedia(MEDIA_QUERIES[key]).matches);
    } catch {
      // A single unsupported query must not cost the other two.
      out[key] = false;
    }
  }
  return out;
}
