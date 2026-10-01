import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import SettingsSheet from "../components/player/v2/SettingsSheet";
import {
  isRadioKey,
  nextRadioIndex,
  radioTabIndex,
  radioTabStopIndex,
} from "../components/player/v2/radioGroup";

const CSS = readFileSync(
  join(import.meta.dirname, "../components/player/v2/player.css"),
  "utf8",
);

/* ── The pure arithmetic ──────────────────────────────────────────────────────
 *
 * Everything here is a DOM-free function over a list, so it can be checked at the
 * edges where the rendering tests cannot see: wrapping in both directions, a group
 * with nothing selectable in it, an inert row in the middle of the ring. jsdom's
 * `Tab` does not move focus and its `ArrowRight` does not either, so an integration
 * test alone would leave every one of these unobserved. */

describe("the radiogroup arithmetic (3.26)", () => {
  it("moves one step in each direction", () => {
    expect(nextRadioIndex(5, 2, "ArrowRight")).toBe(3);
    expect(nextRadioIndex(5, 2, "ArrowDown")).toBe(3);
    expect(nextRadioIndex(5, 2, "ArrowLeft")).toBe(1);
    expect(nextRadioIndex(5, 2, "ArrowUp")).toBe(1);
  });

  it("wraps in both directions, because the group is a ring", () => {
    /* Not a detail. A group that stops at the ends makes the last option look like
     * the end of the list rather than the end of the ring, and a viewer has to
     * Shift+ArrowRight all the way back to get around. */
    expect(nextRadioIndex(5, 4, "ArrowRight")).toBe(0);
    expect(nextRadioIndex(5, 0, "ArrowLeft")).toBe(4);
    /* And both axes wrap, not just the horizontal ones — a vertical stack is still a
     * ring, so ArrowDown off the last option has to come back to the first. */
    expect(nextRadioIndex(5, 4, "ArrowDown")).toBe(0);
    expect(nextRadioIndex(5, 0, "ArrowUp")).toBe(4);
  });

  it("skips inert options in both directions", () => {
    /* The failure this prevents is subtle and looks like a broken key: plain
     * `index + 1` lands on a disabled row, focusing something that cannot be
     * activated, so the viewer's next ArrowRight appears to do nothing. They press
     * again, it stalls again, and the control reads as frozen. */
    const enabled = (i) => i !== 2;
    expect(nextRadioIndex(5, 1, "ArrowRight", { enabled })).toBe(3);
    expect(nextRadioIndex(5, 3, "ArrowLeft", { enabled })).toBe(1);
    /* And past the gap, so the skip is not just "one step over". */
    expect(nextRadioIndex(5, 1, "ArrowRight", { enabled })).toBe(3);
  });

  it("wraps over an inert row rather than stopping at it", () => {
    /* The single-row ring, and the case `index + 1` cannot produce at all: every
     * option but one is inert, so a forward step from the only usable row has to
     * wrap onto itself. Returning `null` here would make the arrows do nothing in a
     * group that still has something in it. */
    const enabled = (i) => i === 3;
    expect(nextRadioIndex(5, 3, "ArrowRight", { enabled })).toBe(3);
    expect(nextRadioIndex(5, 3, "ArrowLeft", { enabled })).toBe(3);
  });

  it("jumps to the usable ends with Home and End", () => {
    const enabled = (i) => i !== 0 && i !== 4;
    expect(nextRadioIndex(5, 2, "Home", { enabled })).toBe(1);
    expect(nextRadioIndex(5, 2, "End", { enabled })).toBe(3);
    /* Plain Home/End with nothing inert are the ends themselves. */
    expect(nextRadioIndex(5, 2, "Home")).toBe(0);
    expect(nextRadioIndex(5, 2, "End")).toBe(4);
  });

  it("goes nowhere when every option is inert", () => {
    /* Returns `null`, NOT the current index. The distinction matters at the call
     * site: `null` tells the component not to claim the keystroke at all, so the
     * browser's own scrolling still works. Returning the current index would let the
     * group call `preventDefault()` on an arrow key in a panel that has nothing to
     * select, and the viewer would be pressing a key that does nothing at all. */
    const none = () => false;
    expect(nextRadioIndex(5, 2, "ArrowRight", { enabled: none })).toBeNull();
    expect(nextRadioIndex(5, 2, "Home", { enabled: none })).toBeNull();
    expect(nextRadioIndex(5, 2, "End", { enabled: none })).toBeNull();
  });

  it("still moves when the checked row is itself inert", () => {
    /* Reachable: a preference restored from storage names a speed that has since been
     * dropped from the ladder, or a subtitle track whose row arrived disabled. If an
     * inert start position were treated as "outside the group", the arrows would jump
     * to an end and skip everything between — a single press moving the selection
     * four rows instead of one. */
    const enabled = (i) => i !== 0;
    expect(nextRadioIndex(4, 0, "ArrowRight", { enabled })).toBe(1);
  });

  it("returns null for an empty or nonsensical group", () => {
    expect(nextRadioIndex(0, -1, "ArrowRight")).toBeNull();
    expect(nextRadioIndex(-3, 0, "ArrowRight")).toBeNull();
    expect(nextRadioIndex(undefined, 0, "ArrowRight")).toBeNull();
    /* A position past the end is "outside", not a place to move from. */
    expect(nextRadioIndex(3, 99, "ArrowRight")).toBe(0);
  });

  it("ignores keys it does not own", () => {
    /* Tab especially. 3.25's trap is a separate handler that must still receive Tab,
     * so a group that claimed it would strand the viewer inside the group with no way
     * out — the trap would never get its turn. */
    for (const key of ["Tab", "Escape", " ", "Enter", "PageDown", "F5"]) {
      expect(nextRadioIndex(5, 2, key), key).toBeNull();
      expect(isRadioKey(key), key).toBe(false);
    }
    for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"]) {
      expect(isRadioKey(key), key).toBe(true);
    }
  });

  it("picks the checked option as the single tab stop", () => {
    expect(radioTabStopIndex(5, { checkedIndex: 3 })).toBe(3);
    /* And the roving tabindex: exactly one `0`, everything else `-1`. Explicit `-1`
     * rather than omitted — a native button defaults to `0`, so omitting the
     * attribute puts every option back in the tab order and the change appears to do
     * nothing at all. */
    expect([0, 1, 2, 3, 4].map((i) => radioTabIndex(i, 3))).toEqual([-1, -1, -1, 0, -1]);
  });

  it("falls back to the first usable option when nothing is checked", () => {
    /* Reachable and not hypothetical: volume offers five discrete levels, and a
     * volume the drag gesture left at 0.8 matches no row. The group has no tab stop
     * if it only ever tabbables the checked one — so the viewer Tabs past the panel
     * and cannot get back to it. */
    expect(radioTabStopIndex(5, { checkedIndex: -1 })).toBe(0);
    expect(radioTabStopIndex(5, {})).toBe(0);
    /* And past the end, for a value naming an option that no longer exists. */
    expect(radioTabStopIndex(3, { checkedIndex: 99 })).toBe(0);
    /* But not onto an inert one. */
    expect(radioTabStopIndex(3, { checkedIndex: -1, enabled: (i) => i !== 0 })).toBe(1);
  });

  it("gives an all-inert group no tab stop at all", () => {
    /* `null`, not index 0. Handing `0` to a disabled row puts the caret on a control
     * that cannot be activated, and a trap that does that is worse than a group the
     * viewer skips — Tab lands on it, Enter does nothing, and the whole sheet reads
     * as broken. */
    expect(radioTabStopIndex(5, { checkedIndex: -1, enabled: () => false })).toBeNull();
    expect(radioTabStopIndex(0, { checkedIndex: 0 })).toBeNull();
    expect([0, 1].map((i) => radioTabIndex(i, null))).toEqual([-1, -1]);
  });
});

/* ── In the rendered sheet ──────────────────────────────────────────────────── */

function sub(over = {}) {
  return {
    subtitles: {
      languages: [
        { language: "English", languageId: "en", downloadLink: "x" },
        { language: "Tamil", languageId: "ta", downloadLink: "y" },
        { language: "Telugu", languageId: "te", downloadLink: "z" },
      ],
      track: null,
      select: vi.fn(),
      loading: false,
      error: null,
      ...over,
    },
  };
}

function open(panelId, panels = {}) {
  return render(<SettingsSheet panelId={panelId} onClose={() => {}} panels={panels} />);
}

/** Drive an arrow key the way the browser does. */
function pressArrow(node, key) {
  node.focus();
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  fireEvent(node, event);
  return event;
}

describe("the radiogroup in the sheet (3.26)", () => {
  it("is a group of radios, and says how many there are", () => {
    open("captions", sub());
    const group = screen.getByRole("radiogroup", { name: /subtitle track/i });
    /* The count is part of the point: under `aria-pressed` a viewer heard "toggle
     * button, not pressed" per row and never learned that choosing one turned the
     * others off. "1 of 4" says the rows are one choice out of several. */
    expect(group).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  it("carries aria-checked on every option, checked or not", () => {
    /* All of them. `aria-checked={selected ? "true" : undefined}` is the tempting
     * version and it is wrong: on a role whose checked state is REQUIRED, an absent
     * attribute leaves the option's state undefined, and most assistive tech then
     * guesses from the visual highlight — which is exactly the coupling this is meant
     * to remove. So `false` has to be spelled out. */
    open("captions", sub({ track: { language: "Tamil", languageId: "ta" } }));
    for (const option of screen.getAllByRole("radio")) {
      expect(["true", "false"]).toContain(option.getAttribute("aria-checked"));
    }
  });

  it("moves both focus AND selection on an arrow, not just focus", () => {
    /* The cheapest thing to get wrong, and the reason `SegmentControl.jsx` is worth
     * copying rather than re-deriving. Moving focus alone is `role="listbox"`
     * behaviour: a screen-reader user presses ArrowRight under a radiogroup, hears
     * nothing change, and concludes the control is broken. The onSelect spy is the
     * assertion that matters — a test checking only `document.activeElement` would
     * pass a group that navigates without changing anything. */
    const panels = sub();
    open("captions", panels);
    const off = screen.getByRole("radio", { name: /off/i });
    pressArrow(off, "ArrowDown");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /english/i }));
    expect(panels.subtitles.select).toHaveBeenCalledWith(
      expect.objectContaining({ language: "English" }),
    );
  });

  it("moves backwards too, and both vertical axes", () => {
    const panels = sub();
    open("captions", panels);
    const english = screen.getByRole("radio", { name: /english/i });
    /* Three presses, all starting from English because `pressArrow` focuses its
     * target first — so each key is measured from a known position rather than from
     * wherever the previous press left the caret.
     *
     * Asserting WHICH option each press chose rather than a call count: a count cannot
     * tell "moved to Off" from "moved to Off twice by accident", and the bug here is a
     * key that quietly does the wrong thing rather than one that stops working. */
    pressArrow(english, "ArrowUp");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /off/i }));
    pressArrow(english, "ArrowLeft");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /off/i }));
    pressArrow(english, "ArrowDown");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /tamil/i }));
    expect(panels.subtitles.select).toHaveBeenNthCalledWith(1, null);
    expect(panels.subtitles.select).toHaveBeenNthCalledWith(2, null);
    expect(panels.subtitles.select).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ language: "Tamil" }),
    );
    expect(panels.subtitles.select).toHaveBeenCalledTimes(3);
  });

  it("wraps off the end, so the group is a ring", () => {
    open("captions", sub());
    const last = screen.getByRole("radio", { name: /telugu/i });
    const event = pressArrow(last, "ArrowDown");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /off/i }));
    /* And the key is genuinely consumed: without `preventDefault` the player scrolls
     * as well as moving, so the panel slides under the caret mid-navigation. */
    expect(event.defaultPrevented).toBe(true);
  });

  it("lands on the checked option, not the first, when Tab arrives", () => {
    /* The roving tabindex's whole purpose. Six subtitle languages as six stops means a
     * keyboard viewer tabs six times to get past a list they may not have wanted to
     * change at all. */
    open("captions", sub({ track: { language: "Telugu", languageId: "te" } }));
    const stops = screen
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(screen.getByRole("radio", { name: /telugu/i }));
  });

  it("still gives a group with nothing checked exactly one stop", () => {
    /* Volume at 0.8 matches none of the five levels. If the group only tabbabled a
     * checked option it would have no stop at all, and the viewer would Tab past the
     * panel and be unable to get back to it. */
    open("volume", {
      controls: { volume: 0.8, muted: false, setVolume: vi.fn(), toggleMute: vi.fn() },
    });
    const stops = screen
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(screen.getByRole("radio", { name: "0%" }));
  });

  it("leaves Tab to 3.25's trap instead of claiming it", () => {
    /* The failure this prevents is the sheet becoming a keyboard trap: a group that
     * swallowed Tab would mean the trap never got its turn and the viewer could not
     * leave.
     *
     * `defaultPrevented` is TRUE here, and asserting it is false would be the wrong
     * test — 3.25's trap legitimately calls `preventDefault()` on Tab because it is
     * moving focus itself, to keep the wrap inside the dialog. So the question is not
     * "did anyone prevent it" but "did the GROUP handle it".
     *
     * The observable is where focus lands. From the group's tab stop, Tab must leave
     * the group entirely: the group's next option is `tabindex="-1"` and the browser
     * would skip it, so a handler that walked the group's own rows would move focus
     * to Tamil. It has to go to the close button instead — and on a panel with one
     * group that is also the backward wrap, which is what makes this one assertion
     * cover both that the group released the key and that the trap still works. */
    const { container } = open("captions", sub());
    const stop = screen.getByRole("radio", { name: /off/i });
    expect(stop.getAttribute("tabindex")).toBe("0");
    pressArrow(stop, "Tab");
    expect(document.activeElement).toBe(
      container.querySelector(".pv2-sheet__close"),
    );
  });

  it("does not advance the selection when Tab leaves the group", () => {
    /* The other half of the same mistake, and the one that actually changes something.
     * If the group's handler ran on Tab it would call `onSelect` as well as moving
     * focus, so a viewer tabbing PAST the subtitle list would silently switch the
     * track to whatever row the group thought was next. */
    const panels = sub();
    open("captions", panels);
    pressArrow(screen.getByRole("radio", { name: /off/i }), "Tab");
    expect(panels.subtitles.select).not.toHaveBeenCalled();
  });

  it("still selects with a click, which is how most viewers use it", () => {
    /* The arrows are an addition, not a replacement. Nothing about 3.26 should change
     * what a pointer press does, and a regression here is invisible to every other
     * test in this file because they all drive the keyboard. */
    const panels = sub();
    open("captions", panels);
    fireEvent.click(screen.getByRole("radio", { name: /tamil/i }));
    expect(panels.subtitles.select).toHaveBeenCalledWith(
      expect.objectContaining({ language: "Tamil" }),
    );
  });

  it("keeps Mute out of the group, because a toggle is not a choice", () => {
    /* Muting is INDEPENDENT of the level: mute, then unmute, and a viewer expects to
     * get their 80% back. As option one in the level group, ArrowDown onto it would
     * change the level too, and the group's checked answer would be a lie — which is
     * it, "Mute" or "80%"? */
    open("volume", {
      controls: { volume: 0.8, muted: false, setVolume: vi.fn(), toggleMute: vi.fn() },
    });
    /* Five levels, and the mute button is not one of them. */
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.queryByRole("radio", { name: /^mute/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^mute/i })).toBeTruthy();
    /* And it is a toggle, which is a different ARIA state from a checked option. */
    expect(screen.getByRole("button", { name: /^mute/i }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("keeps an arrow from changing the level when it lands on Mute", () => {
    /* The observable consequence of the separation above. With Mute inside the group,
     * one ArrowDown from the top level would both mute and change the volume, and the
     * viewer would have to undo two things to get back. */
    const controls = { volume: 0.5, muted: false, setVolume: vi.fn(), toggleMute: vi.fn() };
    open("volume", { controls });
    pressArrow(screen.getByRole("button", { name: /^mute/i }), "ArrowDown");
    /* The handler is on the group, so a press that never entered it changes nothing. */
    expect(controls.setVolume).not.toHaveBeenCalled();
    expect(controls.toggleMute).not.toHaveBeenCalled();
  });

  it("does not claim arrows in a panel with nothing selectable", () => {
    /* `persistent: false` disables every aspect row. Swallowing ArrowDown there would
     * leave the viewer pressing a key that does nothing AND stop the panel scrolling —
     * `nextRadioIndex` returning `null` is what tells the component to stay out of it. */
    open("settings", { prefs: { aspectId: "fit", setAspect: vi.fn(), persistent: false } });
    const event = pressArrow(screen.getByRole("radio", { name: /fit \(original 16:9\)/i }), "ArrowDown");
    expect(event.defaultPrevented).toBe(false);
  });

  it("keeps the loading and error notes out of the group", () => {
    /* A `role="status"` paragraph inside a radiogroup is announced as another option,
     * and "Loading subtitles…" would then be selectable — arrows would move onto it,
     * Enter would do nothing, and the live region's announcement would be lost under
     * the group traversal. */
    open("captions", sub({ loading: true, languages: [] }));
    const status = screen.getByRole("status");
    expect(status.closest("[role='radiogroup']")).toBeNull();
    /* And only the "Off" option is in the group, because nothing has loaded yet. */
    expect(screen.getAllByRole("radio")).toHaveLength(1);
  });

  it("re-renders the tab stop when the selection changes", () => {
    /* The roving tabindex has to FOLLOW the selection, not be fixed at mount. A stop
     * left behind on a row that is no longer current means Tab arrives on a row the
     * group no longer thinks is selected, and the viewer's next arrow jumps from
     * somewhere they were not. */
    const panels = sub();
    const { rerender } = open("captions", panels);
    expect(screen.getByRole("radio", { name: /off/i }).getAttribute("tabindex")).toBe("0");
    rerender(
      <SettingsSheet
        panelId="captions"
        onClose={() => {}}
        panels={sub({ track: { language: "Tamil", languageId: "ta" } })}
      />,
    );
    expect(screen.getByRole("radio", { name: /tamil/i }).getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("radio", { name: /off/i }).getAttribute("tabindex")).toBe("-1");
  });

  it("does not move focus when the selection changes from outside the keyboard", () => {
    /* Selection can arrive from places that are not the keyboard — a restored
     * preference, a track finishing loading. Keying focus off the render would then
     * focus a row nobody asked to focus, yanking the caret out from under a viewer who
     * was reading the list. The tab stop may move; `document.activeElement` may not. */
    const { rerender } = open("captions", sub());
    const off = screen.getByRole("radio", { name: /off/i });
    off.focus();
    rerender(
      <SettingsSheet
        panelId="captions"
        onClose={() => {}}
        panels={sub({ track: { language: "English", languageId: "en" } })}
      />,
    );
    expect(document.activeElement).toBe(off);
    expect(off.getAttribute("tabindex")).toBe("-1");
  });

  it("lets Escape through the group to 3.25's handler", () => {
    /* The same reason Tab is not claimed: Escape closes the sheet, and the group's
     * handler returning early on a key it does not own is what lets that happen. */
    const onClose = vi.fn();
    render(<SettingsSheet panelId="captions" onClose={onClose} panels={sub()} />);
    const off = screen.getByRole("radio", { name: /off/i });
    off.focus();
    fireEvent.keyDown(off, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("CSS keys the marker off the ARIA state, not focus and not :checked", () => {
    /* `:checked` never matches a `<button role="radio">` — it is a form-control
     * pseudo-class — so the whole marker would silently stop rendering: a stylesheet
     * that compiles, a build that passes, and a sheet where nothing is ever visibly
     * selected. */
    expect(CSS).toMatch(/\[role="radio"\]\[aria-checked="true"\]/);
    expect(CSS).not.toMatch(/\[role="radio"\]:checked/);
    /* And the stale attribute selector must be gone entirely. */
    expect(CSS).not.toMatch(/\[data-selected="true"\]/);
  });
});
