/**
 * Focus trapping for the settings sheet (task.md 3.25).
 *
 * ── Why this is a module and not an effect inside the component ────────────────
 * The trap is arithmetic over a list: given what is focusable now and what has
 * focus, decide where focus goes next. Arithmetic is testable without a DOM, and
 * this is exactly the logic that goes wrong in ways a rendering test cannot see —
 * an off-by-one that lets Tab escape on the last row, or a trap that throws when
 * the list is empty. Both of those need a real focus stack to observe, and jsdom's
 * `Tab` does not move focus on its own.
 *
 * Pure functions, no React, no DOM access — the same shape as `tiers.js` and
 * `timecode.js`.
 */

/**
 * Every element that COULD be focusable inside a container, in DOCUMENT order.
 *
 * `querySelectorAll` returns document order, which is the order Tab uses, and
 * re-deriving it with a sort would be a second ordering to keep correct.
 *
 * The selector covers what this sheet can actually contain, and it is deliberately
 * broad: `tabindex` is NOT filtered out here. That was 3.25's version, and 3.26's
 * roving tabindex made it a live bug rather than a redundancy — every option in a
 * radiogroup carries `tabindex="-1"` except one, and a selector that matched
 * `button:not([disabled])` would collect all of them anyway. The trap's list and the
 * browser's list then disagree: Tab is supposed to leave a radiogroup after one stop,
 * and this trap instead walked the whole group itself, calling `.focus()` on
 * `tabindex="-1"` rows the browser had deliberately excluded. So a viewer pressing
 * Tab through the subtitle list moved focus INTO the group instead of out of it, and
 * the keyboard got stuck in a list of six languages.
 *
 * Excluding the ineligible ones here would put that knowledge in the selector, where
 * `button:not([disabled])` and `tabindex="-1"` cannot be expressed as one condition
 * anyway — a disabled button is untabbable for a different reason than a
 * roving-tabindex option, and conflating them means fixing one breaks the other.
 */
const FOCUSABLE = ["button", "[href]", "input", "select", "textarea", "[tabindex]"].join(",");

/**
 * The tabbable elements inside `root`, in tab order.
 *
 * Returns `[]` rather than throwing when `root` is gone — a sheet unmounting
 * mid-keypress is a real race, and the caller's job then is to do nothing.
 *
 * `hidden`, `inert` and `tabindex="-1"` are filtered because `aria-modal` does NOT
 * remove anything from the tab order: it is a claim to assistive technology, and the
 * browser's own tab sequence is unchanged. So a control that the code has hidden, or
 * a radiogroup option the roving tabindex has parked, would still be reachable and
 * would swallow the keystroke the viewer meant for something else.
 */
export function tabbables(root) {
  if (!root || typeof root.querySelectorAll !== "function") return [];
  const found = Array.from(root.querySelectorAll(FOCUSABLE));
  return found.filter(isTabbable);
}

/** One element's eligibility. Exported because the filter's reasons are the
 *  interesting part and a test should be able to name them individually. */
export function isTabbable(el) {
  if (!el || el.nodeType !== 1) return false;
  /* `disabled` is a claim the browser honours: a disabled button is out of the tab
   * order entirely.
   *
   * `aria-disabled` deliberately is NOT checked. It is a claim the browser ignores
   * for tab order — a control marked `aria-disabled="true"` stays tabbable unless it
   * also carries `disabled`. Treating it as untabbable would trap focus AROUND a
   * control the viewer can still see and activate, and land on it when they do. */
  if (el.hasAttribute?.("disabled")) return false;
  /* `tabindex="-1"` means "focusable, but not by Tab" — programmatically, and by the
   * 3.26 roving tabindex as the arrows move it. It is the one element the trap must
   * skip, because the trap exists to reproduce the browser's own Tab order, and the
   * browser skips these. */
  if (el.getAttribute?.("tabindex") === "-1") return false;
  if (el.hidden) return false;
  if (el.closest?.("[inert]")) return false;
  return true;
}

/**
 * Where focus should go, given a Tab or Shift+Tab.
 *
 * The wrapping cases are the whole point of a trap:
 *
 *  - Tab on the LAST element wraps to the first. Without it, Tab moves focus to
 *    the next control in the DOCUMENT — which, for a modal sheet, is the page
 *    behind it. A screen-reader user then has a live region announcing page
 *    content while the dialog claims the screen is unavailable.
 *  - Shift+Tab on the FIRST element wraps to the last.
 *  - Tab when focus is NOT inside the list (focus was on the backdrop, or the
 *    viewer clicked a non-focusable part of the sheet) moves to the first element
 *    forward and the LAST element backward. Picking "nearest" instead would jump
 *    backwards on a forward Tab, which is disorienting and looks like a stuck key.
 *
 * Returns `null` for an empty list — there is nowhere to put focus, and returning
 * the container itself would leave focus on a non-interactive node where the next
 * Tab goes straight back out of the trap.
 */
export function nextFocusIndex(count, currentIndex, { backwards = false } = {}) {
  if (!Number.isInteger(count) || count <= 0) return null;
  /* Out of range counts as OUTSIDE, not as a position to advance from.
   *
   * The reachable case is not exotic: focus is on a row, the viewer's pick changes
   * the list (a subtitle track finishes loading and its row disappears, or a panel
   * swap shortens the rows), and the focused element is removed from under the
   * caret. Advancing from a stale index then yields an index past the end —
   * `nextFocusIndex(5, 99)` returned 100 — and `focusables[100]` is `undefined`,
   * so the caller focuses nothing and focus falls to `<body>`, which is OUTSIDE the
   * trap. The viewer's next Tab is then handled from a stale "outside" reading and
   * the trap looks broken. Treating it as outside sends focus to a real end. */
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= count) {
    /* Focus is outside the trap. Forward goes to the top, backward to the bottom —
     * the two ends the viewer is closest to, in the direction they asked for. */
    return backwards ? count - 1 : 0;
  }
  if (backwards) return currentIndex === 0 ? count - 1 : currentIndex - 1;
  return currentIndex === count - 1 ? 0 : currentIndex + 1;
}

/**
 * Whether a keydown should be handled as a trap Tab.
 *
 * Split out because the modifier check is the subtle half: a viewer who presses
 * Ctrl+Tab to switch browser tabs must not have their focus yanked back into the
 * sheet by our handler when the browser returns it. Same for Alt+Tab (the OS
 * window switcher) and Shift+Alt+Tab. `event.preventDefault()` on one of those
 * does not stop the switch, it just breaks it.
 *
 * `key === "Tab"` with no modifier is the only case a trap owns. Anything else —
 * arrows, Enter, Escape — belongs to 3.26's roving tabindex or to the rows.
 */
export function isTrapTab(event) {
  if (!event || event.key !== "Tab") return false;
  return !event.ctrlKey && !event.altKey && !event.metaKey;
}