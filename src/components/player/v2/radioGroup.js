/**
 * Radiogroup arithmetic (task.md 3.26).
 *
 * ── Why this is a module ───────────────────────────────────────────────────────
 * Arrow-key navigation is arithmetic over a list: given a position, a key and which
 * options are usable, decide where focus goes. Pure functions mean it can be tested
 * exhaustively — wrapping at both ends, skipping inert rows, landing nowhere when
 * nothing is selectable — none of which needs a DOM or a keyboard.
 *
 * ── Why arrows MOVE THE SELECTION rather than only focus ────────────────────────
 * Because that is what `role="radiogroup"` promises. `SegmentControl.jsx` already
 * does this correctly, so there is precedent and no argument to have; but it is worth
 * naming because the alternative (arrows move focus, Space/Enter selects) is what
 * `role="listbox"` means, and shipping listbox behaviour under a radiogroup role
 * leaves a screen-reader user who presses ArrowRight hearing nothing change and
 * concluding the control is broken.
 */

/** The keys a radiogroup owns. Exported so the component and the tests cannot
 *  disagree about which keys are claimed — a key claimed here and not handled
 *  there is a key that silently does nothing. */
export const RADIO_KEYS = Object.freeze({
  next: ["ArrowRight", "ArrowDown"],
  previous: ["ArrowLeft", "ArrowUp"],
  first: ["Home"],
  last: ["End"],
});

/** True for a key this group handles. Everything else — Tab included — belongs to
 *  3.25's trap or to the browser. */
export function isRadioKey(key) {
  return (
    RADIO_KEYS.next.includes(key) ||
    RADIO_KEYS.previous.includes(key) ||
    RADIO_KEYS.first.includes(key) ||
    RADIO_KEYS.last.includes(key)
  );
}

/**
 * Where a keypress moves focus, or `null` when it does not.
 *
 * Wraps in both directions, because a radiogroup is a RING: the last option's
 * ArrowRight goes to the first, not nowhere. A group that stops at the ends makes
 * the final row look like the end of the list rather than the end of the ring, and
 * a viewer has to Shift+ArrowRight all the way back.
 *
 * INERT OPTIONS ARE SKIPPED, in both directions, with the ring closed over what
 * remains. This is the part that is easy to get wrong: `index + 1` on a disabled
 * row lands focus on something that cannot be activated, so the arrow key appears
 * to do nothing, and a viewer pressing ArrowRight repeatedly watches focus stall.
 *
 * Returns `null` — not the current index — when nothing is selectable. The caller
 * must then leave the key alone: `preventDefault()` would swallow a keystroke the
 * browser could still use to scroll the panel, and focusing a disabled row is
 * exactly the outcome being avoided.
 */
export function nextRadioIndex(count, currentIndex, key, { enabled } = {}) {
  if (!Number.isInteger(count) || count <= 0) return null;

  const usable = (index) => (typeof enabled === "function" ? enabled(index) !== false : true);

  let start = Number.isInteger(currentIndex) && currentIndex >= 0 ? currentIndex : -1;

  /* An inert starting point still counts as a position to move FROM, so a group
   * where the checked row is disabled still has somewhere to move to. */
  if (start >= count) start = -1;

  if (key === "Home") return firstUsable(count, usable, 1);
  if (key === "End") return firstUsable(count, usable, -1);

  const backwards = RADIO_KEYS.previous.includes(key);
  if (!backwards && !RADIO_KEYS.next.includes(key)) return null;

  const step = backwards ? -1 : 1;
  for (let seen = 1; seen <= count; seen += 1) {
    const candidate = start + step * seen;
    /* Wrap by counting, not by comparing against a bound: the ring closes over the
     * list length, so stepping past either end lands on the other side. */
    const wrapped = ((candidate % count) + count) % count;
    if (usable(wrapped)) return wrapped;
  }
  return null;
}

/** The first usable index in the given direction, or null. Used by Home/End, which
 *  are "jump to an end" rather than "move one step". */
function firstUsable(count, usable, step) {
  for (let seen = 0; seen < count; seen += 1) {
    const index = step > 0 ? seen : count - 1 - seen;
    if (usable(index)) return index;
  }
  return null;
}

/**
 * Which option is the group's single tab stop.
 *
 * This is the roving tabindex, and it is what makes a radiogroup ONE Tab stop rather
 * than one per option. Six subtitle languages as six tab stops means a keyboard
 * viewer tabs six times to get past a list they may not want to change at all.
 *
 * The order of preference, and why:
 *
 *  1. The CHECKED option, if it is usable. The group's state is where the viewer
 *     expects to land — arriving on the current selection is what lets them decide
 *     whether to change it.
 *  2. Otherwise the first usable option. A group whose value matches nothing (a
 *     corrupt preference, or a speed between the ladder's rungs) must still be
 *     REACHABLE, or it is a trap of the other kind: the viewer Tabs past it and
 *     cannot get back.
 *  3. Otherwise `null` — every option is inert. The group is then not a tab stop at
 *     all, which is honest: there is nothing to select, so there is nothing to tab
 *     to. Handing out `0` to a disabled row would put the caret on a control that
 *     cannot be activated, and a trap that does that is worse than a group the
 *     viewer skips.
 */
export function radioTabStopIndex(count, { checkedIndex, enabled } = {}) {
  if (!Number.isInteger(count) || count <= 0) return null;
  const usable = (index) => (typeof enabled === "function" ? enabled(index) !== false : true);
  if (Number.isInteger(checkedIndex) && checkedIndex >= 0 && checkedIndex < count && usable(checkedIndex)) {
    return checkedIndex;
  }
  for (let index = 0; index < count; index += 1) {
    if (usable(index)) return index;
  }
  return null;
}

/**
 * The `tabindex` for one option.
 *
 * `0` for the group's single stop and `-1` for everything else. Not `undefined`:
 * omitting the attribute leaves the button at its native `0`, which puts EVERY
 * option back in the tab order and silently undoes the roving tabindex — the
 * failure looks like the change not having taken effect at all.
 */
export function radioTabIndex(index, tabStopIndex) {
  return index === tabStopIndex ? 0 : -1;
}
