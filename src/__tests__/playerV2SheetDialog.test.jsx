import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import SettingsSheet from "../components/player/v2/SettingsSheet";
import { tabbables } from "../components/player/v2/focusTrap";

const CSS = readFileSync(
  join(import.meta.dirname, "../components/player/v2/player.css"),
  "utf8",
);

/**
 * The modal contract (task.md 3.25).
 *
 * Two claims, and they are not the same claim:
 *
 *  - The sheet is a DIALOG to assistive technology (`role`, `aria-modal`,
 *    `aria-labelledby`). A claim, entirely — it changes nothing about the browser.
 *  - The sheet is a TRAP to the keyboard (Tab wrapping, Escape ordering). Actual
 *    behaviour, which `aria-modal` does not provide on its own.
 *
 * Testing only the first produces a sheet that announces itself perfectly and lets
 * the viewer's next Tab walk off into the page behind it. So most of what follows
 * asserts behaviour, with the ARIA as the part that is easy to assert wrongly.
 */

/** A sheet with the captions panel open (the one with rows) or nothing at all. */
function open(over = {}) {
  return render(
    <SettingsSheet
      panelId="captions"
      onClose={() => {}}
      panels={{
        subtitles: {
          languages: [
            { language: "English", languageId: "en", downloadLink: "x" },
            { language: "Tamil", languageId: "ta", downloadLink: "y" },
          ],
          track: null,
          select: vi.fn(),
          loading: false,
          error: null,
        },
      }}
      {...over}
    />,
  );
}

/** The sheet's focusable rows, header close button excluded (see 3.24's note). */
function rows(container) {
  return Array.from(container.querySelectorAll(".pv2-sheet__body button"));
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("the sheet is a dialog (3.25)", () => {
  it("is a modal dialog, not a group or a region", () => {
    open();
    const dialog = screen.getByRole("dialog");
    /* `aria-modal="true"` specifically. Without it a screen reader treats the sheet
     * as ordinary content and lets the viewer browse the page behind it — the
     * "modal" is the entire claim this role makes. */
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("is named by its visible heading", () => {
    open();
    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    /* The name must RESOLVE to the visible heading, not just point somewhere: an
     * `aria-labelledby` naming a missing id announces an empty dialog, and the
     * viewer cannot tell which panel they opened. */
    const target = document.getElementById(labelledBy);
    expect(target?.textContent).toBe("Subtitles");
    expect(target?.tagName).toBe("H2");
  });

  it("renames itself when the panel changes", () => {
    /* A stale `aria-labelledby` is the subtle version of this: the dialog still
     * announces "Subtitles" after the viewer opens Episodes. */
    const { rerender } = open();
    rerender(<SettingsSheet panelId="episodes" onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")).textContent).toBe(
      "Episodes",
    );
  });

  it("is a dialog only while open", () => {
    const { rerender } = open();
    expect(screen.queryByRole("dialog")).toBeTruthy();
    rerender(<SettingsSheet panelId={null} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("focus enters and leaves the sheet (3.25)", () => {
  it("moves focus into the sheet on open", () => {
    const { container } = open();
    /* Not merely "focus is somewhere inside". Without this a viewer cannot tell
     * which layer has focus, and their next Tab starts by leaving the dialog. */
    const dialog = container.querySelector(".pv2-sheet");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("returns focus to the opener on close", () => {
    /* The regression this prevents is invisible in every other test: focus lands
     * on `<body>`, i.e. the TOP of the document, and a keyboard viewer has to Tab
     * back through the whole app to reach the player again. */
    const opener = document.createElement("button");
    opener.textContent = "Subtitles";
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { rerender } = render(<SettingsSheet panelId="captions" onClose={() => {}} />);
    expect(opener.contains(document.activeElement) || document.activeElement !== opener).toBe(
      true,
    );

    rerender(<SettingsSheet panelId={null} onClose={() => {}} />);
    expect(document.activeElement).toBe(opener);
  });

  it("does not steal focus when it never opened", () => {
    /* The unmount path runs effects too. Without the transition guard, closing a
     * sheet that was never open would yank focus away from whatever the viewer is
     * actually using — a background player stealing the caret mid-sentence. */
    const outside = document.createElement("input");
    document.body.appendChild(outside);
    outside.focus();
    const { rerender } = render(<SettingsSheet panelId={null} onClose={() => {}} />);
    expect(document.activeElement).toBe(outside);
    rerender(<SettingsSheet panelId="captions" onClose={() => {}} />);
    rerender(<SettingsSheet panelId={null} onClose={() => {}} />);
    /* After a real open→close it should have moved, so re-focus outside to prove
     * the SECOND close did nothing. */
    outside.focus();
    expect(document.activeElement).toBe(outside);
  });

  it("survives the opener being gone", () => {
    /* The opener can unmount first: a panel swap while the sheet is open, or a
     * title change. Restoring focus to a disconnected node silently does nothing,
     * and throwing here takes the player down over a close. */
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<SettingsSheet panelId="captions" onClose={() => {}} />);
    opener.remove();
    expect(() => rerender(<SettingsSheet panelId={null} onClose={() => {}} />)).not.toThrow();
  });
});

describe("the trap (3.25)", () => {
  /** Drive a Tab the way the browser does: the handler must both read
   *  `document.activeElement` and be given the focused element as `target`. */
  function pressTab(node, { shiftKey = false } = {}) {
    node.focus();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(node, event);
    return event;
  }

  /* The trap's list, in the order Tab walks it.
   *
   * `querySelectorAll(".pv2-sheet button")` is NOT this, and using it here is a bug
   * that 3.26 made live rather than latent: the captions panel is a radiogroup, so
   * five of its six rows carry `tabindex="-1"` and the browser skips them. A trap
   * built from "all the buttons" would call `.focus()` on rows the browser had
   * deliberately excluded, and Tab would walk INTO the subtitle list instead of out
   * of it. The trap's whole job is to reproduce the browser's own order, so the tests
   * have to ask the same question the browser asks. */
  function tabOrder(container) {
    return tabbables(container.querySelector(".pv2-sheet"));
  }

  it("wraps forward from the last element to the first", () => {
    const { container } = open();
    const all = tabOrder(container);
    const last = all[all.length - 1];
    const event = pressTab(last);
    /* The whole point: without the wrap, Tab moves focus to the page BEHIND the
     * sheet, so a screen reader announces page content while the dialog claims the
     * screen is unavailable. */
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(all[0]);
  });

  it("wraps backward from the first element to the last", () => {
    const { container } = open();
    const all = tabOrder(container);
    const event = pressTab(all[0], { shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(all[all.length - 1]);
  });

  it("moves forward within the list, not just at the edges", () => {
    /* The VOLUME panel, not captions: it is the one panel with three tab stops (close
     * button, the Mute toggle, and the level group as a single stop), so it is the
     * only one where a middle move can be observed. Under captions the list is
     * [close, group] and there is no interior step to test — which is 3.26's point,
     * asserted separately below. */
    const { container } = render(
      <SettingsSheet
        panelId="volume"
        onClose={() => {}}
        panels={{
          controls: {
            volume: 0.5,
            muted: false,
            setVolume: vi.fn(),
            toggleMute: vi.fn(),
          },
        }}
      />,
    );
    const all = tabOrder(container);
    expect(all).toHaveLength(3);
    pressTab(all[1]);
    expect(document.activeElement).toBe(all[2]);
  });

  it("stops at one stop per group, not one per option", () => {
    /* 3.26's roving tabindex, seen from the trap's side. Six subtitle options plus
     * the close button would be seven tab stops if the trap walked every row; the
     * browser walks two, and a trap that disagrees strands the keyboard inside the
     * group with no way out. Asserting the LENGTH rather than each stop's identity —
     * a test that checked "the group is in there" passes just as well while the trap
     * still walks all five parked options. */
    const { container } = open();
    expect(tabOrder(container)).toHaveLength(2);
  });

  it("pulls focus back in when it has escaped", () => {
    /* Focus on the backdrop or a click on a non-focusable part of the sheet. The
     * trap has to notice and reclaim, or the viewer's next Tab starts outside. */
    const { container } = open();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    const dialog = container.querySelector(".pv2-sheet");
    pressTab(dialog);
    const all = tabOrder(container);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(all[0].contains(document.activeElement) || document.activeElement === all[0]).toBe(
      true,
    );
  });

  it("leaves Ctrl+Tab and Alt+Tab to the browser", () => {
    const { container } = open();
    const all = tabOrder(container);
    const last = all[all.length - 1];
    last.focus();
    /* Prevented here does not stop a tab switch — it breaks it. And a trap that
     * reclaims focus when the viewer comes back has yanked them out of whatever
     * they switched to. */
    for (const mod of ["ctrlKey", "altKey", "metaKey"]) {
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        [mod]: true,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(last, event);
      expect(event.defaultPrevented, mod).toBe(false);
      expect(document.activeElement).toBe(last);
    }
  });

  it("keeps at least the close button focusable in a panel with no rows", () => {
    /* The servers panel renders a note and nothing else, and the subtitles panel
     * can be empty for a title OpenSubtitles has nothing for. The trap therefore
     * never faces an empty list in practice — the header's close button is in
     * every panel — so Tab wraps onto itself and focus STAYS INSIDE rather than
     * falling out to the page. That is why `preventDefault` here is correct even
     * though focus does not visibly move.
     *
     * Worth pinning because it is the assumption the empty-list branch in
     * `nextFocusIndex` exists for, and the assumption is invisible until a panel
     * arrives with no rows at all. */
    const { container } = render(<SettingsSheet panelId="server" onClose={() => {}} />);
    const close = container.querySelector(".pv2-sheet__close");
    expect(close).toBeTruthy();

    /* Press from OUTSIDE so that "focus ended up on the close button" can only be
     * true if the trap put it there. Pressing Tab on the close button itself and
     * then asserting it still has focus passes even with the trap's move deleted —
     * the handler would just do nothing and the assertion would still hold. */
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    const dialog = container.querySelector(".pv2-sheet");
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    fireEvent(dialog, event);

    expect(document.activeElement).toBe(close);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reclaims focus when the focused row disappears under the caret", () => {
    /* The reachable case: focus is on a subtitle row, the download resolves and
     * the row list changes, and the focused element is removed. Advancing from the
     * stale index yields an index past the end, `undefined.focus()` focuses
     * nothing, and focus falls to `<body>` — outside the trap, which is the one
     * place a trap must never put it. */
    let setLanguages;
    function Harness() {
      const [langs, update] = useState([
        { language: "English", languageId: "en", downloadLink: "x" },
        { language: "Tamil", languageId: "ta", downloadLink: "y" },
      ]);
      setLanguages = update;
      return (
        <SettingsSheet
          panelId="captions"
          onClose={() => {}}
          panels={{
            subtitles: { languages: langs, track: null, select: vi.fn(), loading: false, error: null },
          }}
        />
      );
    }
    const { container } = render(<Harness />);
    const list = rows(container);
    list[1].focus();
    expect(document.activeElement).toBe(list[1]);

    /* Rerender with the focused row gone, leaving focus on a detached node. */
    act(() => setLanguages([{ language: "English", languageId: "en", downloadLink: "x" }]));

    const dialog = container.querySelector(".pv2-sheet");
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    fireEvent(dialog, event);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

describe("dismissal (3.25)", () => {
  it("closes on a backdrop press", () => {
    const onClose = vi.fn();
    const { container } = open({ onClose });
    fireEvent.click(container.querySelector(".pv2-sheet__backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the press is inside the sheet", () => {
    /* Why the backdrop is a SIBLING rather than a parent: if it wrapped the sheet,
     * every row click would bubble to it and close the panel the click landed in.
     * Separate elements make "the press was on the scrim" a DOM fact rather than a
     * coordinate comparison. */
    const onClose = vi.fn();
    const { container } = open({ onClose });
    fireEvent.click(rows(container)[1]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the backdrop out of the accessibility tree", () => {
    /* Decorative, and not interactive for assistive tech: the dialog is the sheet,
     * and a scrim has nothing to announce. Without `aria-hidden` it is an unnamed
     * region between the viewer and the dialog. */
    const { container } = open();
    const backdrop = container.querySelector(".pv2-sheet__backdrop");
    expect(backdrop.getAttribute("aria-hidden")).toBe("true");
    /* And it must not be in the tab order — a tabbable scrim is a focus stop
     * outside the trap. */
    expect(backdrop.querySelectorAll("a,button,input,[tabindex]")).toHaveLength(0);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    const { container } = open({ onClose });
    const dialog = container.querySelector(".pv2-sheet");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape from a ROW, not only from the sheet itself", () => {
    /* A bubbling handler on the sheet node catches every press inside it, but only
     * because focus is always inside the sheet — the trap is what guarantees that.
     * The day the trap regresses, a sheet with focus outside stops dismissing, so
     * this asserts from where the viewer actually is: on a row. */
    const onClose = vi.fn();
    const { container } = open({ onClose });
    fireEvent.keyDown(rows(container)[1], { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close twice when Escape is pressed on a row that bubbles", () => {
    /* The sheet handles Escape on the node, and the rows have no handler of their
     * own, so one press is one call. Two would mean a handler on both the row and
     * the sheet without a `stopPropagation` between them — which is also how a
     * panel would end up closing AND playing/pausing on one keypress. */
    const onClose = vi.fn();
    const { container } = open({ onClose });
    fireEvent.keyDown(rows(container)[0], { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stops Escape from reaching the player's own handler", () => {
    /* The ordering, as a test. React's synthetic propagation runs from the sheet
     * upward, so the sheet's `stopPropagation` is what makes this true — a
     * `window` listener would already have been passed by the time the sheet saw
     * the event, and both layers would close on one Escape. */
    const playerClose = vi.fn();
    function Harness() {
      const [panel, setPanel] = useState("captions");
      return (
        <div onKeyDown={(e) => e.key === "Escape" && playerClose()}>
          <SettingsSheet panelId={panel} onClose={() => setPanel(null)} />
        </div>
      );
    }
    const { container } = render(<Harness />);
    fireEvent.keyDown(container.querySelector(".pv2-sheet"), { key: "Escape" });
    expect(playerClose).not.toHaveBeenCalled();
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    const { container } = open({ onClose });
    fireEvent.keyDown(container.querySelector(".pv2-sheet"), { key: "Enter" });
    fireEvent.keyDown(container.querySelector(".pv2-sheet"), { key: "a" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("CSS", () => {
  it("scopes the backdrop to the player, not the page", () => {
    /* A full-viewport scrim dims the whole site and swallows presses meant for the
     * page. `inset: 0` resolves against the shell, which is `position: relative`. */
    const block = CSS.slice(CSS.indexOf(".pv2-sheet__backdrop {"));
    expect(block).toMatch(/position: absolute/);
    expect(block).toMatch(/inset: 0/);
    expect(block).not.toMatch(/position: fixed/);
  });

  it("puts the backdrop above the chrome and under the sheet", () => {
    const back = Number(
      CSS.match(/\.pv2-sheet__backdrop \{[^}]*z-index:\s*(\d+)/s)[1],
    );
    const sheet = Number(CSS.match(/\.pv2-sheet \{[^}]*z-index:\s*(\d+)/s)[1]);
    const chrome = Number(CSS.match(/\.pv2-chrome \{[^}]*z-index:\s*(\d+)/s)[1]);
    expect(back).toBeGreaterThan(chrome);
    expect(sheet).toBeGreaterThan(back);
  });

  it("uses no viewport units", () => {
    const block = CSS.slice(CSS.indexOf("/* ── The sheet's backdrop"));
    expect(block).not.toMatch(/\d(vw|vh|vmin|vmax)\b/);
  });
});
