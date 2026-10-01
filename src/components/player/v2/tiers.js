/**
 * The transport's control spine (task.md 3.7).
 *
 * The ORDER is the contract, and it is data rather than JSX order so it can be
 * asserted. `play - timecode - scrubber - volume - captions - settings -
 * fullscreen` is not an arbitrary sequence: transport controls follow the
 * universal convention (leftmost = start of timeline, rightmost = view
 * environment), and a scrubber sitting anywhere else is a mis-grab waiting to
 * happen. A test that reads this list is what stops a later "while I was in
 * here" reorder from shipping.
 *
 * Pure, with no React and no props, because the alternative — reading the order
 * out of the rendered DOM — cannot distinguish "reordered" from "not rendered
 * yet", and a check that passes on an empty transport is not a check.
 */

/** Control ids, in Tier A order. Everything else lives in the sheet (3.24). */
export const TIER_A_CONTROLS = Object.freeze([
  "play",
  "timecode",
  "scrubber",
  "volume",
  "captions",
  "settings",
  "fullscreen",
]);

/**
 * Controls that open a settings panel rather than acting immediately.
 *
 * `captions` and `settings` are in this list, `play` is not, and the difference
 * is the whole 3.27 contract: a sheet-opening button needs `aria-haspopup` and
 * `aria-controls` pointing at a real panel, while an immediate action needs
 * neither. 3.24 is what gives these a panel to point at; until then they are
 * buttons that legitimately do nothing visible, which is why they are called
 * out here rather than left to be discovered as dead buttons.
 *
 * 3.9 adds `speed`, `episodes`, `users` and `server` to the same list. All four
 * are multi-option panels, not immediate actions — the same distinction.
 */
export const SHEET_OPENERS = Object.freeze([
  "captions",
  "settings",
  "speed",
  "episodes",
  "users",
  "server",
  /* 3.12's third volume path. Only reachable in zones mode — in row mode the
   * volume control is the mute toggle, which has nothing to open. `TransportBar`
   * reads this through `isSheetOpener` so the two modes cannot disagree about
   * whether the control is an opener. */
  "volume",
]);

/**
 * Tier A is the DEFAULT tier (task.md 3.7), and it is the default for a reason
 * worth recording before 3.9 changes it: Tier A is the set of controls that fit
 * a phone-width box without truncating, so it is the safe fallback whenever
 * there is no room — a small container, or a tier decision that could not be
 * made at all. Tier B is the one that needs justifying, never this.
 */
export const DEFAULT_TIER = "A";

/**
 * Tier B (task.md 3.9) — Tier A's spine plus the six controls that need more
 * room than a phone has.
 *
 * The order is built around one rule: Tier A's own sequence is preserved
 * EXACTLY, and the new controls are slotted around it. That is deliberate — a
 * viewer who learned where the scrubber sits in Tier A must not have to relearn
 * it when the transport grows, so `play - timecode - scrubber - volume` appears
 * here in the same relative positions. The additions then follow the universal
 * transport convention:
 *
 *   left  = get elsewhere  (episodes, prev, next) — start of the timeline
 *   spine = the thing you came for (Tier A, verbatim)
 *   right = change the environment (speed, aspect, captions, server, users,
 *           settings, fullscreen)
 *
 * So the row reads as "leave / watch / shape", which is also why `episodes`
 * leads: it is the furthest "somewhere else" and belongs at the far edge.
 */
export const TIER_B_CONTROLS = Object.freeze([
  // left — navigation
  "episodes",
  "prevEpisode",
  "nextEpisode",
  // spine — Tier A, in its documented order, unchanged
  "play",
  "timecode",
  "scrubber",
  "volume",
  // right — environment
  "speed",
  "aspect",
  "captions",
  "server",
  "users",
  "settings",
  "fullscreen",
]);

/**
 * The width below which Tier B is not offered.
 *
 * 720px rather than an arbitrary number: the legacy player already treated 720
 * as its laptop/tablet edge (`HUD_REFERENCE_EDGE` in `constants/playerUi.js`),
 * and a 14-control row cannot fit a phone-width box without either truncating
 * or shrinking every hit target below a usable size.
 */
export const TIER_B_MIN_WIDTH = 720;

/**
 * Which tier to render (task.md 3.9).
 *
 * Two gates, and BOTH must pass for Tier B. Pure, so the policy is a truth table
 * in a test rather than a conditional buried in the shell.
 *
 * 1. ENGAGED — the viewer is paused, or interacting (pointer/keyboard/focus),
 *    or the chrome is being held open because playback ended or failed. Note
 *    that this is `data-chrome`'s own answer (3.8), so there are no second set of
 *    pointer/focus listeners here: "engaged" and "the chrome is visible" are the
 *    same question, and asking it twice is how two timelines drift apart.
 * 2. ROOM — the box is at least `TIER_B_MIN_WIDTH` wide.
 *
 * Width is checked SECOND and the unknown-width case returns Tier A, which is
 * the documented safe fallback: a control set that cannot be shown in full is
 * worse than a control set that is merely smaller, because truncation moves
 * targets under the viewer's finger.
 */
export function resolveTier({ width = null, engaged = false, minWidthForB = TIER_B_MIN_WIDTH } = {}) {
  if (!engaged) return DEFAULT_TIER;
  const measured = Number(width);
  // Not finite, zero, or negative means "not measured yet" — ResizeObserver has
  // not delivered, or the box is display:none. Tier A until it does.
  if (!Number.isFinite(measured) || measured <= 0) return DEFAULT_TIER;
  return measured >= minWidthForB ? "B" : DEFAULT_TIER;
}

/** The control ids a tier renders. Anything unrecognised is Tier A, so a bad
 *  value degrades to the compact set instead of to nothing. */
export function controlsForTier(tier) {
  return tier === "B" ? TIER_B_CONTROLS : TIER_A_CONTROLS;
}

export function isSheetOpener(controlId) {
  return SHEET_OPENERS.includes(controlId);
}

/**
 * Every control id the transport can ever show (task.md 3.10, extended by 3.11).
 *
 * This exists because of the single most useful fact about the two tiers, which
 * only became obvious once both existed: **Tier A is a strict SUBSET of Tier B.**
 * Rendering the active tier's list therefore renders FEWER nodes, and swapping
 * tiers unmounts seven of them. Two layouts, one after the other, is exactly what
 * 3.10 rules out.
 *
 * So the transport renders this superset unconditionally and expresses the tier
 * as PRESENCE. The seven Tier-B-only controls stay in the DOM for Tier A, and a
 * row that grows in place is the thing 3.10 asks for. It also means nothing can
 * be added to one tier and forgotten in the other: a control that exists in
 * exactly one spine is a bug the test below names.
 *
 * B's order first, then any A-only ids, so a contract break degrades to
 * "appended at the end" rather than to an arbitrary order.
 */
export const TRANSPORT_SUPERSET = Object.freeze([
  ...new Set([...TIER_B_CONTROLS, ...TIER_A_CONTROLS]),
]);

/**
 * How the transport is laid out (task.md 3.11).
 *
 * A SECOND axis, and deliberately not part of the tier: a tier answers "how much
 * room is there", a mode answers "what is the viewer holding". A narrow window on
 * a desktop gets Tier A and a full row; a 900px tablet held in two hands gets
 * Tier B's controls in thumb-sized corner clusters. Folding the two together
 * would mean a width number that secretly also encodes a device type.
 */
export const TRANSPORT_MODE = {
  /** The single horizontal row — a fine pointer. */
  ROW: "row",
  /** Two thumb clusters at the bottom corners — a coarse pointer. */
  ZONES: "zones",
};

/**
 * The touch layout (task.md 3.11): LEFT play / -10s / +10s / speed, RIGHT
 * captions / settings / fullscreen / close.
 *
 * Two lists rather than one tagged list, because ORDER is the contract in each
 * corner and a tag on a shared spine could not express it — `play` leads on the
 * left and `fullscreen` trails on the right, and those positions are what a thumb
 * learns. Exported so tests assert the order rather than infer it.
 *
 * Note what is NOT here: the timecode and the scrubber. On touch the bottom edge
 * belongs to thumbs, and a rail you cannot drag without a pointer is furniture.
 * 3.13-3.15 own the scrubber; they are not this item's problem.
 */
export const TOUCH_ZONE_LEFT = Object.freeze([
  "play",
  "skipBack",
  "skipForward",
  "speed",
  /* 3.12 adds the sheet entry. It goes LAST on the left, after the four controls
   * 3.11 specified and in their order, because those four are now muscle memory
   * for the viewers who already have them. The item's list is preserved as a
   * prefix rather than re-spread — that is the whole reason the order was frozen
   * as a list instead of being derived from the tier spine.
   *
   * Five on the left is the practical ceiling: at 44px each plus gaps, that is
   * ~250px, which fits a 320px viewport with room for the right cluster. */
  "volume",
]);

export const TOUCH_ZONE_RIGHT = Object.freeze([
  "captions",
  "settings",
  "fullscreen",
  "close",
]);

/** id -> "left" | "right". Derived from the two lists so a control cannot be in a
 *  corner without acquiring that corner. */
export const TOUCH_ZONES = Object.freeze(Object.fromEntries(
  [...TOUCH_ZONE_LEFT.map((id) => [id, "left"]), ...TOUCH_ZONE_RIGHT.map((id) => [id, "right"])],
));

/**
 * The superset, now including the three controls that exist ONLY in zones mode.
 *
 * `skipBack`, `skipForward` and `close` are in neither tier spine — they are not
 * desktop controls, and putting them in Tier B would ship a row of skip buttons
 * next to the episode skip buttons, which is a genuinely confusing pair of
 * neighbours. They are still rendered unconditionally, for 3.10's reason: one
 * DOM, and presence carries the whole layout decision. In row mode they are
 * absent nodes, which costs three inert buttons.
 */
export const ALL_CONTROL_IDS = Object.freeze([
  ...new Set([...TRANSPORT_SUPERSET, ...TOUCH_ZONE_LEFT, ...TOUCH_ZONE_RIGHT]),
]);

/** The ids in the superset that `tier` does not render. */
export function absentControls(tier, mode = TRANSPORT_MODE.ROW) {
  const present = new Set(presentControlIds(tier, mode));
  return ALL_CONTROL_IDS.filter((id) => !present.has(id));
}

/** The ids rendered for a given (tier, mode). Order matters: it is the layout. */
export function presentControlIds(tier, mode = TRANSPORT_MODE.ROW) {
  if (mode === TRANSPORT_MODE.ZONES) {
    return [...TOUCH_ZONE_LEFT, ...TOUCH_ZONE_RIGHT];
  }
  return controlsForTier(tier);
}

/**
 * Whether `controlId` is rendered for a given (tier, mode).
 *
 * Presence, not availability: this is about which layout the control belongs to,
 * not whether it is usable right now. A disabled prev/next on the first episode
 * is still present; a skip-back at 0:00 is present and disabled.
 *
 * `mode` defaults to `ROW`, so every 3.10 caller and test keeps its meaning.
 */
export function isPresentInTier(controlId, tier, mode = TRANSPORT_MODE.ROW) {
  return presentControlIds(tier, mode).includes(controlId);
}

/**
 * The visual order of a control within the zones layout.
 *
 * A plain integer fed to CSS `order`, NOT a reordering of the DOM. That is the
 * whole trick of 3.11 meeting 3.10: the nodes stay in one fixed DOM order, and
 * only their `order` changes, so switching input modality re-lays-out the SAME
 * elements. Re-sorting the array instead would remount every control that appears
 * in both layouts, dropping focus and any in-flight interaction at exactly the
 * moment someone picks up a finger.
 */
export function zoneOrder(controlId) {
  const left = TOUCH_ZONE_LEFT.indexOf(controlId);
  if (left !== -1) return left;
  const right = TOUCH_ZONE_RIGHT.indexOf(controlId);
  // Offset well clear of the left cluster so the two never interleave.
  return right === -1 ? 0 : 100 + right;
}

/** Which corner a control occupies in zones mode, or null if it is row-only. */
export function zoneFor(controlId) {
  return TOUCH_ZONES[controlId] ?? null;
}

/**
 * The one control whose start margin creates the space between the clusters.
 *
 * Exactly one, because an `auto` inline-start margin absorbs ALL free space
 * before its item — on the left cluster's first control it would push the left
 * cluster to the END edge and swap the layout, and on every right-cluster control
 * it would share the space between them and scatter the cluster. The right
 * cluster's first control is the only place that puts the gap in the middle.
 */
export function zonePushesToEnd(controlId) {
  return controlId === TOUCH_ZONE_RIGHT[0];
}

