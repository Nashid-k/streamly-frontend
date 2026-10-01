import { describe, it, expect } from "vitest";
import {
  tabbables,
  isTabbable,
  nextFocusIndex,
  isTrapTab,
} from "../components/player/v2/focusTrap";

/** A minimal stand-in for the DOM queries `tabbables` performs. */
function node({ disabled = false, hidden = false, inert = false, tabindex = null } = {}) {
  const el = {
    nodeType: 1,
    hidden,
    hasAttribute: (name) => name === "disabled" && disabled,
    closest: (sel) => (sel === "[inert]" && inert ? {} : null),
  };
  if (tabindex !== null) el.getAttribute = () => String(tabindex);
  return el;
}

describe("focusTrap (3.25)", () => {
  describe("isTrapTab", () => {
    it("owns a bare Tab", () => {
      expect(isTrapTab({ key: "Tab" })).toBe(true);
    });

    it("leaves modified Tabs to the browser", () => {
      // Ctrl+Tab switches browser tabs, Alt+Tab switches OS windows. Calling
      // preventDefault() on those does not stop the switch, it breaks it — and a
      // trap that reclaims focus when the user comes back has yanked them out of
      // whatever they switched to.
      expect(isTrapTab({ key: "Tab", ctrlKey: true })).toBe(false);
      expect(isTrapTab({ key: "Tab", altKey: true })).toBe(false);
      expect(isTrapTab({ key: "Tab", metaKey: true })).toBe(false);
    });

    it("still owns Shift+Tab", () => {
      // Shift is not a browser shortcut for Tab. Excluding it would leave the
      // backward edge of the trap open.
      expect(isTrapTab({ key: "Tab", shiftKey: true })).toBe(true);
    });

    it("ignores other keys and rubbish", () => {
      /* Not a formality. A trap that claims EVERY keydown calls `preventDefault()`
       * on arrow keys, Enter and Escape — so Space stops paging and Enter stops
       * activating the focused row. And `isTrapTab({})` must be false rather than
       * throw, because a synthetic event from a library can arrive without `key`. */
      expect(isTrapTab({ key: "Escape" })).toBe(false);
      expect(isTrapTab({ key: "ArrowDown" })).toBe(false);
      expect(isTrapTab({ key: " " })).toBe(false);
      expect(isTrapTab({ key: "Enter" })).toBe(false);
      expect(isTrapTab(null)).toBe(false);
      expect(isTrapTab({})).toBe(false);
    });
  });

  describe("isTabbable", () => {
    it("accepts a plain element", () => {
      expect(isTabbable(node())).toBe(true);
    });

    it("rejects non-elements", () => {
      // A text node reaching the filter means a querySelectorAll result was walked
      // wrongly; without this it would throw inside a keydown handler.
      expect(isTabbable(null)).toBe(false);
      expect(isTabbable({ nodeType: 3 })).toBe(false);
      expect(isTabbable("button")).toBe(false);
    });

    it("rejects disabled, hidden and inert", () => {
      expect(isTabbable(node({ disabled: true }))).toBe(false);
      expect(isTabbable(node({ hidden: true }))).toBe(false);
      expect(isTabbable(node({ inert: true }))).toBe(false);
    });

    it("keeps an aria-disabled element, because the browser still tabs to it", () => {
      /* `aria-disabled="true"` is a claim to assistive tech and changes nothing
       * about the tab sequence. Excluding it would trap focus AROUND a control
       * the viewer can see, land on it, and activate it — the exact thing
       * aria-disabled is used to prevent. */
      const el = node();
      el.hasAttribute = () => false;
      expect(isTabbable(el)).toBe(true);
    });
  });

  describe("tabbables", () => {
    it("returns an empty list rather than throwing for a missing root", () => {
      /* The sheet can unmount mid-keypress. A trap that throws there takes the
       * player's DOM down over a Tab. */
      expect(tabbables(null)).toEqual([]);
      expect(tabbables({})).toEqual([]);
      expect(tabbables("nope")).toEqual([]);
    });

    it("keeps document order, filtering ineligible elements", () => {
      const a = node();
      const off = node({ disabled: true });
      const b = node();
      const root = {
        querySelectorAll: () => [a, off, b],
      };
      expect(tabbables(root)).toEqual([a, b]);
    });
  });

  describe("nextFocusIndex", () => {
    it("advances within the list", () => {
      expect(nextFocusIndex(4, 0)).toBe(1);
      expect(nextFocusIndex(4, 2)).toBe(3);
    });

    it("wraps forward off the end", () => {
      /* The trap. Without this, Tab on the last row moves focus to the page BEHIND
       * the dialog, so a screen reader announces page content while the dialog
       * claims the screen is unavailable. */
      expect(nextFocusIndex(4, 3)).toBe(0);
    });

    it("wraps backward off the start", () => {
      expect(nextFocusIndex(4, 0, { backwards: true })).toBe(3);
      expect(nextFocusIndex(4, 2, { backwards: true })).toBe(1);
    });

    it("goes to the nearest end when focus is outside the list", () => {
      /* Focus on the backdrop, or a click on a non-focusable part of the sheet.
       * Forward to the first, backward to the last — "nearest" would jump
       * backwards on a forward Tab, which looks like a stuck key. */
      expect(nextFocusIndex(5, -1)).toBe(0);
      expect(nextFocusIndex(5, -1, { backwards: true })).toBe(4);
      expect(nextFocusIndex(5, undefined)).toBe(0);
      expect(nextFocusIndex(5, null)).toBe(0);
      /* An index past the end is a STALE index, not a position: the focused row was
       * removed from under the caret (a subtitle track finished loading and its row
       * disappeared). Advancing from it yielded 100, and `focusables[100]` is
       * undefined, so the caller focused nothing and focus fell to `<body>` —
       * outside the trap, which is the one place a trap must never put it. */
      expect(nextFocusIndex(5, 99)).toBe(0);
      expect(nextFocusIndex(5, 99, { backwards: true })).toBe(4);
    });

    it("returns null when there is nowhere to go", () => {
      /* Returning the container itself would put focus on a non-interactive node
       * where the next Tab escapes the trap immediately. */
      expect(nextFocusIndex(0, -1)).toBeNull();
      expect(nextFocusIndex(0, 0)).toBeNull();
      expect(nextFocusIndex(-1, 0)).toBeNull();
      expect(nextFocusIndex(undefined, 0)).toBeNull();
    });

    it("handles a single element without moving", () => {
      /* One row and a Tab that does nothing is correct: there is nowhere else to
       * go, and wrapping to the same element is the only answer that keeps focus
       * inside. */
      expect(nextFocusIndex(1, 0)).toBe(0);
      expect(nextFocusIndex(1, 0, { backwards: true })).toBe(0);
    });
  });
});