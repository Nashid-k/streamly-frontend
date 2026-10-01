import { PLAYER_SPEEDS, snapPlaybackRate } from "../../../constants/playerUi";

/**
 * How a playback rate is written (task.md 3.9).
 *
 * The legacy player had TWO different literals for the same value: the speed
 * panel said `"Normal (1x)"` and the settings row above it said `"Normal"`
 * (`NativePlayerView.jsx:5099` vs `:4853`). Two spellings of one state is how a
 * UI starts disagreeing with itself, so there is one function here and every
 * caller goes through it.
 *
 * Short form only. The transport button has room for `1.5x` and nothing else;
 * a panel row (3.24) that wants the longer "Normal (1x)" should compose
 * `${formatRate(rate)}` with its own wording rather than reintroducing a second
 * branch of the same conditional.
 *
 * Trailing zeros are stripped so `1` renders as `1x` and not `1.0x`. `1.0` and
 * `1` are the same number but not the same string, and a settings page that
 * lists "1x" beside a player showing "1.0x" looks broken.
 */
export function formatRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return formatRate(1);
  return `${String(value).replace(/\.0+$/, "")}x`;
}

/** The next rate on the ladder, wrapping. Snapping to the ladder is the same
 *  rule `sanitizePreference` applies on write, kept in one place so the value a
 *  control shows and the value that gets stored cannot disagree. */
export function nextRate(rate) {
  const current = Number(rate);
  // Normalise through the shared snapper first, so an off-ladder value cannot
  // make the step direction depend on rounding. `nextRate(1.37)` and the
  // sanitiser that ran on load must agree on what 1.37 means.
  const index = PLAYER_SPEEDS.indexOf(snapPlaybackRate(current));
  return PLAYER_SPEEDS[(index + 1) % PLAYER_SPEEDS.length];
}
