/**
 * Which settings panel the sheet shows (task.md 3.24).
 *
 * ── Why this is a module and not a switch inside the sheet ─────────────────────
 * Three things need the same answer — the sheet's heading, the transport button
 * that is "current", and the test that a panel renders alone — and a switch inside
 * a JSX file makes all three re-derive it. Worse, the second derivation is where
 * stacked overlays come from: each panel answering "is it me?" from its own state
 * rather than from one `panelId`, which is exactly how you end up with three
 * panels open at once.
 *
 * Pure, no React, no DOM — the same shape as `tiers.js` and `rate.js`.
 */

/**
 * The panels, in sheet order.
 *
 * The order is the order the transport presents them, NOT an alphabet. `captions`
 * is first because it is the opener most viewers reach for; `server` is last
 * because it is a troubleshooting panel rather than a preference.
 *
 * `SHEET_OPENERS` in `tiers.js` is the authority on WHICH ids can open a sheet —
 * that list is frozen because the transport's control map is frozen. This list is
 * the authority on what the sheet can actually render, and the two must agree;
 * `panelDefinition` throws nothing and returns null instead, so an id that somehow
 * arrives from neither list renders no sheet rather than an empty one.
 */
export const SHEET_PANELS = Object.freeze([
  { id: "captions", title: "Subtitles" },
  { id: "settings", title: "Aspect ratio" },
  { id: "speed", title: "Playback speed" },
  /* 3.12's third volume path. In zones mode the volume control is a sheet entry
   * rather than a mute toggle, so it needs a panel like every other opener —
   * without one, tapping it in touch mode opens an empty sheet. In row mode the
   * control never opens anything (it is the mute toggle), so this panel is
   * unreachable there, which is correct: the sheet is only ever reachable from a
   * control that pressed `onOpenSheet`. */
  { id: "volume", title: "Volume" },
  { id: "episodes", title: "Episodes" },
  { id: "users", title: "Watching" },
  { id: "server", title: "Servers" },
]);

const BY_ID = new Map(SHEET_PANELS.map((panel) => [panel.id, panel]));

/** The definition for an id, or null. Never throws: `sheetPanel` is state that a
 *  stale transport button or a restored session can set to anything. */
export function panelDefinition(panelId) {
  return BY_ID.get(panelId) ?? null;
}

/** The heading for an id, or null when the id is not a panel. */
export function panelTitle(panelId) {
  return BY_ID.get(panelId)?.title ?? null;
}

/**
 * The DOM id of the panel an opener controls (task.md 3.27).
 *
 * ── Why the id is DERIVED and not stored ──────────────────────────────────────
 * `aria-controls` is a relationship between two elements that live in different
 * files: the opener is rendered by `TransportBar`, the panel by `SettingsSheet`, and
 * neither imports the other. So the string has to be derivable from the panel id on
 * both sides, and it has to be derivable rather than stored — an id stored on the
 * opener and a different one stamped on the panel would compile, pass every unit test
 * (each file asserts its own half) and produce a reference that resolves to nothing.
 *
 * The prefix is fixed here, next to `SHEET_PANELS`, for the same reason the title id
 * is fixed next to the dialog: one owner for the naming, so a rename cannot leave a
 * stale half behind.
 *
 * Returns `null` for an id that is not a panel, and callers must pass that through to
 * React as `undefined` rather than stringifying it. `null` becomes the literal text
 * "null" in an attribute, so `aria-controls="null"` would be an id that resolves to
 * nothing — the exact failure this function exists to prevent, reintroduced at the last
 * step. */
export function panelDomId(panelId) {
  return BY_ID.has(panelId) ? `pv2-sheet-panel-${panelId}` : null;
}

/**
 * Which panel a press on `panelId` should show.
 *
 * Pressing the opener for the panel already open CLOSES it. That is not 3.25's
 * backdrop-click and Escape — those are separate affordances — it is the one that
 * makes "one panel at a time" safe: without a way to dismiss, the only escape is
 * 3.25, and until it lands a sheet would be a one-way door.
 *
 * A press on a DIFFERENT panel replaces the current one rather than queueing
 * behind it, so there is never a moment with two panels stacked.
 */
export function nextPanelId(currentId, pressedId) {
  if (!BY_ID.has(pressedId)) return currentId ?? null;
  return currentId === pressedId ? null : pressedId;
}