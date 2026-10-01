/**
 * Pure gesture classification for the touch video surface (task.md 3.12).
 *
 * ── Why this is a separate module ─────────────────────────────────────────────
 * `NativePlayerView.jsx` grew this inline across `handleGestureStart`,
 * `handleGestureMove` and `handleVideoTouchEnd`, which made it impossible to
 * test: the interesting decisions — is this a drag or a tap, which zone, is it
 * horizontal or vertical — only exist as the *difference* between two handlers,
 * and a bug in that difference shows up as a player that seeks when it should
 * change volume. Nothing here touches a DOM or React, so every branch is
 * assertable in isolation.
 *
 * ── What 3.12 asks for ────────────────────────────────────────────────────────
 * "Touch gets THREE discoverable volume paths (left-third horizontal slide,
 * persistent level indicator, sheet entry). Today it has ZERO." Three paths, one
 * surface, and they must not fight each other — which is the whole reason the
 * classification is separated from the handling.
 *
 * ── The one decision that matters ─────────────────────────────────────────────
 * HORIZONTAL on the left third means VOLUME. Everything else is a non-gesture.
 * That single rule resolves what would otherwise be three ambiguities at once:
 *
 *   - a TAP in the left third is play/pause, not volume 0;
 *   - a VERTICAL drag anywhere is not volume, so double-tap rewind and the
 *     press-and-hold 2x arm both survive on the right zone;
 *   - a HORIZONTAL drag on the centre or right third is not volume, so it stays
 *     available to whatever else claims it later.
 *
 * Note this differs from the legacy player on purpose. Legacy used a VERTICAL
 * drag on the RIGHT third for volume (`handleGestureMove`, `dy * 0.008`). 3.12
 * specifies a horizontal left-third slide, which is the convention every current
 * mobile player uses: it reads as a physical fader under the thumb, and a
 * vertical drag on the left is already spoken for by the seek rail in 3.13-3.15.
 */

/** Which third of the surface a touch landed in. */
export const GESTURE_ZONE = {
  LEFT: "left",
  CENTER: "center",
  RIGHT: "right",
};

/** What a pointer sequence turned out to be. */
export const GESTURE = {
  /** Nothing claimed it — let the tap/double-tap handlers have it. */
  NONE: "none",
  /** A horizontal drag on the left third. The only volume gesture. */
  VOLUME: "volume",
};

/**
 * Pixels a finger must travel before a press is allowed to become a drag.
 *
 * Matches the legacy player's 14px arming distance. Below it, a press is a tap:
 * arming on the first pixel would make every play/pause tap on the left third
 * also nudge the volume, which is the single most annoying thing a video player
 * can do to a thumb.
 */
export const DRAG_ARM_PX = 14;

/**
 * Horizontal travel that maps to the full 0-1 volume range.
 *
 * The legacy used `dy * 0.008`, i.e. 125px for the whole range on any screen.
 * Deriving it from the container instead means a wide tablet does not need four
 * times the travel of a phone, and a narrow one does not need a flick to cross
 * it. The value is a DIVISOR, not a multiplier, so a larger container is easier
 * to sweep — which is the behaviour a physical fader has.
 */
export const VOLUME_TRAVEL_FRACTION = 0.8;

/** Which third of `rect` contains `clientX`. Mirrors legacy `zoneOf`. */
export function zoneOf(rect, clientX) {
  const left = rect?.left ?? 0;
  const width = rect?.width ?? 0;
  if (width <= 0) return GESTURE_ZONE.CENTER;
  const x = clientX - left;
  if (x < width / 3) return GESTURE_ZONE.LEFT;
  if (x > (width * 2) / 3) return GESTURE_ZONE.RIGHT;
  return GESTURE_ZONE.CENTER;
}

/**
 * Is this pointer horizontal enough to be a volume drag?
 *
 * The dominance test (`dx` must beat `dy`) is what lets a sloppy diagonal still
 * work while a deliberate vertical drag does not. Without it a diagonal flick
 * would change volume, which is never what anyone meant.
 */
export function isHorizontalIntent(dx, dy) {
  return Math.abs(dx) > Math.abs(dy);
}

/**
 * Decide whether a drag in progress is the volume gesture.
 *
 * `startZone` is captured at pointer-DOWN, not recomputed per move: a finger that
 * started in the left third and slid across the middle is still a left-third
 * gesture. Recomputing would make the gesture's meaning depend on where it
 * happened to be when the viewer noticed it.
 */
export function classifyDrag({ startZone, totalDx, totalDy, armed }) {
  if (!armed) return GESTURE.NONE;
  if (startZone !== GESTURE_ZONE.LEFT) return GESTURE.NONE;
  if (!isHorizontalIntent(totalDx, totalDy)) return GESTURE.NONE;
  return GESTURE.VOLUME;
}

/**
 * New volume level for a drag.
 *
 * Absolute-from-position, not incremental: the level is computed from where the
 * finger is along the sweep, mapped onto the range. An incremental
 * `volume += delta` drifts, because the finger's absolute position is the only
 * stable thing about a drag — and on a re-grab mid-gesture an incremental
 * implementation jumps by whatever offset it accumulated.
 *
 * Clamped here rather than at the element so the indicator and the element can
 * never disagree about what the level is.
 */
export function volumeFromDrag({ startX, clientX, containerWidth, startVolume = 0 }) {
  const width = Number(containerWidth);
  if (!Number.isFinite(width) || width <= 0) return clampVolume(startVolume);
  const travel = Math.max(1, width * VOLUME_TRAVEL_FRACTION);
  const delta = (Number(clientX) - Number(startX)) / travel;
  return clampVolume(startVolume + delta);
}

/** A level is 0-1 and always a real number. */
export function clampVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * The level a viewer should actually hear.
 *
 * Separate from the stored level because muting is not the same as zero. If the
 * level is 0.4 and the viewer mutes, a drag should unmute and set 0.4 — not
 * unmute and set 0. Every mobile player gets this wrong at least once, and the
 * symptom is a player that appears to lose the volume the viewer set.
 */
export function audibleVolume({ level, muted }) {
  return muted ? 0 : clampVolume(level);
}

/**
 * Should this drag also lift the mute?
 *
 * Dragging UP (increasing) unmutes; dragging DOWN from a muted state does not
 * re-mute, it just gets quieter. Re-muting on the way down means a viewer who
 * drags down to soften a video and then nudges up again finds it silent, and has
 * to go hunting for a mute button to fix it.
 *
 * The mute flag is a separate argument rather than something derived from the
 * level, because a muted player still HAS a level — muting does not reset it, and
 * this rule exists specifically to preserve that.
 */
export function shouldUnmuteOnDrag({ startLevel, nextLevel, muted = false }) {
  return muted === true && nextLevel > startLevel;
}

/**
 * The level a drag should START from when the player is muted.
 *
 * Zero, not the stored level: a finger landing on a muted player and moving right
 * should sweep up from silence, which is what a fader does. If it started from the
 * stored 0.4 the first pixel of movement would jump straight to a loud level.
 */
export function dragStartLevel({ level, muted }) {
  return muted ? 0 : clampVolume(level);
}

/** The three paths 3.12 requires, as data a test can count. */
export const VOLUME_PATHS = Object.freeze(["slide", "indicator", "sheet"]);