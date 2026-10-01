import { ASPECT_RATIOS, aspectVideoStyle } from "../../../constants/playerUi";

/**
 * Aspect ratio, as a PREFERENCE (task.md 3.9).
 *
 * ── Why ids and not indices ────────────────────────────────────────────────
 * The legacy player persisted an INDEX into `ASPECT_RATIOS`
 * (`architecture.md:77`). An index is a position in someone else's array, so
 * inserting a mode would silently re-point everyone who had chosen "Zoom". This
 * stores the stable `id` instead.
 *
 * `architecture.md:92-94` calls that migration the one lossy edge in the player
 * preference migration, and prescribes the fallback: an out-of-range index falls
 * back to the DEFAULT ratio rather than guessing. `readLegacyAspectId` does
 * exactly that — see its comment for the reasoning.
 *
 * ── A trap in the shared catalog, flagged because it is silent ─────────────
 * `ASPECT_RATIOS[1].scale` is 1.25, but `ASPECT_VIDEO_STYLE.fill.scale` is 1,
 * and `aspectVideoStyle()` reads the STYLE map. So computing a transform from
 * `ASPECT_RATIOS[].scale` would punch "Fill" in by 25% where the shipped player
 * does not. The `scale` on the catalog entry is display data only. Every
 * function here therefore delegates to `aspectVideoStyle(index)` and never
 * derives a style of its own.
 *
 * Pure, no React, no props — the same shape as `timecode.js` and `tiers.js`, so
 * the migration and the catalogue mapping are assertable without a DOM.
 */

/** The frozen legacy key. `AGENTS.md` freezes the localStorage keys documented
 *  in `architecture.md` §2–3, and `architecture.md:77` lists this one as
 *  "retired after migration" — which means it must still be READABLE for exactly
 *  as long as a returning viewer might have it. */
export const LEGACY_ASPECT_KEY = "streamly-native-aspect";

export const DEFAULT_ASPECT_ID = "fit";

const RATIOS = ASPECT_RATIOS;

/** Index -> id. Out of range is the DEFAULT, never a guess (architecture.md:92). */
export function aspectIdFromIndex(index) {
  return Number.isInteger(index) && RATIOS[index] ? RATIOS[index].id : DEFAULT_ASPECT_ID;
}

/** id -> index, with the same fallback. Index 0 is `fit`, which is also the
 *  answer for an unknown id — so a corrupt preference renders Fit rather than
 *  crashing or rendering nothing. */
export function aspectIndexFromId(id) {
  const index = RATIOS.findIndex((mode) => mode.id === id);
  return index === -1 ? 0 : index;
}

export function normalizeAspectId(value) {
  return RATIOS.some((mode) => mode.id === value) ? value : DEFAULT_ASPECT_ID;
}

export function aspectNameForId(id) {
  return RATIOS[aspectIndexFromId(id)].name;
}

/** The full name is too long for a transport button ("Fit (Original 16:9)"), so
 *  the short form is derived from the id — stable, and not a second string to
 *  keep in sync with the catalog. */
export function aspectShortNameForId(id) {
  const safe = normalizeAspectId(id);
  return safe === "crop1610" ? "16:10" : safe.charAt(0).toUpperCase() + safe.slice(1);
}

/** The style object for the `<video>`. Delegated, never re-derived — see the
 *  catalog trap in the header comment. */
export function aspectStyleForId(id) {
  return aspectVideoStyle(aspectIndexFromId(id));
}

/** Cycle to the next mode, wrapping. The legacy `A` key did the same thing by
 *  `(index + 1) % length`, so the order is unchanged for existing viewers. */
export function nextAspectId(id) {
  return aspectIdFromIndex((aspectIndexFromId(id) + 1) % RATIOS.length);
}

/**
 * One-time read of the frozen legacy key.
 *
 * Returns `null` when the key is ABSENT — the caller must be able to tell "this
 * viewer never chose an aspect" from "this viewer's stored value was garbage",
 * because only the first case should fall through to the preference default.
 * A present-but-unusable value returns the DEFAULT rather than null, per
 * architecture.md:92-94.
 *
 * Never throws: localStorage is unavailable in privacy-restricted contexts, and
 * an aspect preference is not worth a blank player over.
 */
export function readLegacyAspectId(storage) {
  try {
    const raw = storage?.getItem(LEGACY_ASPECT_KEY);
    if (raw === null || raw === undefined) return null;
    const index = Number.parseInt(raw, 10);
    // Out of range (a stale index into a shorter catalogue, or a hand-edited
    // value) falls back to the default ratio. Deliberately not "nearest mode":
    // an index of 99 tells us nothing about the viewer's intent, and guessing
    // would silently override a choice we cannot read.
    if (!Number.isInteger(index) || index < 0 || index >= RATIOS.length) {
      return DEFAULT_ASPECT_ID;
    }
    return RATIOS[index].id;
  } catch {
    return null;
  }
}
