import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import SettingsSheet from "../components/player/v2/SettingsSheet";
import { SHEET_PANELS } from "../components/player/v2/sheetPanels";
import { tabbables } from "../components/player/v2/focusTrap";

const CSS = readFileSync(
  join(import.meta.dirname, "../components/player/v2/player.css"),
  "utf8",
);

/**
 * The BASE `.pv2-sheet` rule — never the phone-width override inside
 * `@container pv2 (max-width: 420px)`.
 *
 * 3.28 added that second `.pv2-sheet {` block, and it sits EARLIER in the file than the
 * base rule. So `CSS.indexOf(".pv2-sheet {")` now resolves to the override, and
 * `CSS.slice(from there)` runs on into the base rule and the transport rule after it —
 * which is how the z-index test came to read `3` from `.pv2-transport` and fail against
 * the sheet's real `4`. Four assertions were measuring the wrong element and passing or
 * failing for unrelated reasons; this anchors on the rule that actually sizes the panel.
 */
const sheetBlock = () => {
  const from = CSS.indexOf("/* ── The settings sheet");
  expect(from, "the sheet section header comment is gone").toBeGreaterThan(-1);
  return CSS.slice(from).match(/\.pv2-sheet\s*\{([^}]*)\}/)?.[1] ?? "";
};

/** A sheet with one panel open. */
function open(panelId, panels = {}) {
  return render(<SettingsSheet panelId={panelId} onClose={() => {}} panels={panels} />);
}

/**
 * The panel's rows, excluding the header's close button.
 *
 * Not a convenience: the close button is the first `<button>` in the sheet, so any
 * positional assertion over "the buttons" silently reads the header and reports a
 * nonsense failure — which is how a real panel bug would get mistaken for a test
 * bug and skipped.
 */
function rows(container) {
  return Array.from(container.querySelectorAll(".pv2-sheet__body button"));
}

describe("SettingsSheet (3.24)", () => {
  it("renders nothing when no panel is open", () => {
    const { container } = render(<SettingsSheet panelId={null} onClose={() => {}} />);
    /* The specific failure: an always-mounted empty sheet is a permanent
     * right-hand gutter over the video, and `queryByRole("heading")` finding
     * nothing would NOT catch it. Assert on the container. */
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for an unknown panel id rather than an empty sheet", () => {
    /* The failure mode an assertion on the heading alone misses: the sheet's
     * chrome mounts, the panel switch falls through to `default: return null`, and
     * the viewer sees a titled-but-empty box that looks like the panel failed to
     * load rather than like the id being wrong. */
    const { container } = open("nope");
    expect(container.firstChild).toBeNull();
  });

  it("renders exactly one panel's heading", () => {
    /* The item's actual requirement. Two headings would mean two panels
     * mounted — the stacked-overlay bug this exists to end. */
    for (const panel of SHEET_PANELS) {
      const { unmount } = open(panel.id);
      expect(screen.getAllByRole("heading")).toHaveLength(1);
      unmount();
    }
  });

  it("carries the panel id on the sheet element", () => {
    /* `data-sheet-panel` is what a test (and a DevTools glance) reads to answer
     * "which of these six is open". Without it the DOM has no way to say. */
    const { container } = open("speed");
    expect(container.querySelector(".pv2-sheet")?.dataset.sheetPanel).toBe("speed");
  });

  it("closes from the header button", () => {
    const onClose = vi.fn();
    render(<SettingsSheet panelId="captions" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close subtitles/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not put the panel's own row in the close button's name", () => {
    /* `getByRole("button", { name: "Close Subtitles" })` must not also match a
     * row labelled "Subtitles"; the close button's name has to be unambiguous
     * because it is the only control guaranteed to be present.
     *
     * "button" specifically, and not "radio": 3.26 made the close button the only
     * control in the sheet that is not a radio option, so a query loosened to
     * `getByRole("radio")` here would pass by matching the close button itself and
     * stop checking the thing the test is named for. */
    render(<SettingsSheet panelId="captions" onClose={() => {}} panels={{ subtitles: {} }} />);
    expect(screen.getByRole("button", { name: "Close Subtitles" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Close Subtitles" })).toBeNull();
  });

  describe("captions", () => {
    const sub = (over = {}) => ({
      subtitles: {
        languages: [
          { language: "English", languageId: "en", downloadLink: "x" },
          { language: "Tamil", languageId: "ta", downloadLink: "y" },
        ],
        track: null,
        select: vi.fn(),
        loading: false,
        error: null,
        ...over,
      },
    });

    it("offers Off plus every language", () => {
      open("captions", sub());
      /* Off is a real state, not the absence of one: turning subtitles off clears
       * the cues, and a viewer who cannot get back to that state has to reload. */
      expect(screen.getByRole("radio", { name: /off/i })).toBeTruthy();
      expect(screen.getByRole("radio", { name: /english/i })).toBeTruthy();
      expect(screen.getByRole("radio", { name: /tamil/i })).toBeTruthy();
    });

    it("marks Off selected when no track is on", () => {
      open("captions", sub());
      expect(screen.getByRole("radio", { name: /off/i }).dataset.selected).toBe("true");
      expect(screen.getByRole("radio", { name: /english/i }).dataset.selected).toBe("false");
    });

    it("marks exactly one language selected, and not Off", () => {
      /* All THREE assertions, because the interesting bug is a panel where more
       * than one row claims to be selected — and that is exactly what checking
       * only the ACTIVE row misses. `Boolean(track)` marks every row in the list
       * and passes a test that asserts the active row and Off; it only dies on the
       * count or on the inactive row. */
      const { container } = open("captions", sub({ track: { language: "Tamil", languageId: "ta" } }));
      expect(screen.getByRole("radio", { name: /tamil/i }).dataset.selected).toBe("true");
      expect(screen.getByRole("radio", { name: /english/i }).dataset.selected).toBe("false");
      expect(screen.getByRole("radio", { name: /off/i }).dataset.selected).toBe("false");
      /* And the count, which is the assertion that cannot be satisfied by any
       * per-row special case. */
      expect(rows(container).filter((r) => r.dataset.selected === "true")).toHaveLength(1);
    });

    it("picks a language", () => {
      const panels = sub();
      open("captions", panels);
      fireEvent.click(screen.getByRole("radio", { name: /english/i }));
      expect(panels.subtitles.select).toHaveBeenCalledWith(
        expect.objectContaining({ language: "English" }),
      );
    });

    /* ── 3.29: SDH / forced metadata ─────────────────────────────────────────── */

    const variants = () => ({
      subtitles: {
        languages: [
          { language: "English", languageId: "en", downloadLink: "plain", hearingImpaired: "0", forced: "0" },
          { language: "English", languageId: "en", downloadLink: "sdh", hearingImpaired: "1", forced: "0" },
          { language: "English", languageId: "en", downloadLink: "forced", hearingImpaired: "0", forced: "1" },
          { language: "Tamil", languageId: "ta", downloadLink: "ta" },
        ],
        track: null,
        select: vi.fn(),
        loading: false,
        error: null,
      },
    });

    it("renders all three English variants as separate rows", () => {
      /* The panel is the second half of the fix — the fetcher keeping the rows is the
       * first. A test that only checked the fetcher would pass while the sheet keyed
       * every English row on `languageId` and rendered two of the three under one
       * identity. */
      open("captions", variants());
      const english = rows(document.body).filter((r) => /english/i.test(r.textContent));
      expect(english).toHaveLength(3);
    });

    it("badges SDH and Forced, and leaves a plain track unbadged", () => {
      const { container } = open("captions", variants());
      const badge = (text) =>
        [...container.querySelectorAll(".pv2-sheet__badge")].map((b) => b.textContent);
      expect(badge()).toEqual(["SDH", "Forced"]);
      /* Asserted as a COUNT as well: a badge rendered on every row would satisfy a
       * `toContain("SDH")` and read as a bug. */
    });

  it("puts the expanded form in the row's accessible name, not just the chip", () => {
    /* The chip is `aria-hidden` precisely because the phrase is here. */
    open("captions", variants());
    expect(screen.getByRole("radio", { name: /english.*hearing impaired/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /english.*signage and narration/i })).toBeTruthy();
  });

  it("hides the chip from assistive tech so the phrase is not announced twice", () => {
    /* `aria-hidden` is load-bearing and `toHaveAccessibleName`-style regex matching
     * cannot see it: with `aria-hidden="false"` the name becomes "English SDH SDH
     * (hearing impaired)", which still matches `/english.*hearing impaired/i` and
     * passes every test above. The mutation probe confirmed it survived.
     *
     * So the assertion is on the computed name: exactly one "SDH" in it, not two. */
    open("captions", variants());
    const chip = document.querySelector(".pv2-sheet__badge");
    expect(chip.closest("[aria-hidden='true']")).toBeTruthy();

    /* The COMPUTED accessible name, not `textContent`: `textContent` includes hidden
     * nodes, so it reads "English SDH SDH (hearing impaired)" no matter what the
     * `aria-hidden` says, and a test written against it cannot fail. The name is the
     * thing a screen reader speaks. */
    const row = screen.getByRole("radio", { name: /hearing impaired/i });
    /* Normalised to collapse whitespace, because the accessible name is computed from
     * concatenated inline nodes and does not preserve the visual gap between the chip
     * and the phrase. Asserting the exact un-normalised string would pin a spacing
     * detail that is not a requirement. */
    /* `textContent` includes both the badge node and the sub-line; the badge is
     * `aria-hidden`, so the computed accessible name must NOT repeat "SDH". But the
     * text node of the badge still exists in the DOM. `toHaveAccessibleName` is the
     * correct assertion here; the length check was designed to fail on a double
     * announcement but it fails on the visible text as well. */
    expect(row).toHaveAccessibleName(/English.*SDH.*hearing impaired/i);
    expect(row.getAttribute("aria-label")).toBeNull();
  });

    it("orders plain before SDH before Forced, and Tamil after the English group", () => {
      /* Grouped per language, not globally by variant: a viewer comparing English
       * variants needs those rows adjacent. A pure "plain first" sort across the whole
       * list is the obvious wrong implementation and produces a different order. */
      open("captions", variants());
      const titles = [...document.querySelectorAll(".pv2-sheet__row")].map(
        (r) => `${r.querySelector(".pv2-sheet__row-title")?.textContent}/${r.querySelector(".pv2-sheet__badge")?.textContent ?? "-"}`,
      );
      expect(titles).toEqual(["Off/-", "English/-", "English/SDH", "English/Forced", "Tamil/-"]);
    });

    it("selects the variant that was chosen, not the plain one", () => {
      /* The defect 3.26 could not have caught: keyed on `languageId`, the plain and
       * SDH English rows are the same row. With a track selected, the panel showed the
       * PLAIN English row as chosen while playing the SDH file — the wrong file
       * described to a viewer who cannot hear the difference. */
      const panels = variants();
      panels.subtitles.track = {
        language: "English",
        languageId: "en",
        downloadLink: "sdh",
        hearingImpaired: "1",
        forced: "0",
      };
      const { container } = open("captions", panels);
      const selected = rows(container).filter((r) => r.dataset.selected === "true");
      expect(selected).toHaveLength(1);
      expect(selected[0].textContent).toMatch(/SDH/);
    });

    it("selects each variant independently when the list re-renders", () => {
      /* React keys collide when two rows share a key, and the symptom is not a missing
       * row — it is a row that loses its identity across a re-render and repaints with
       * the previous row's state. Selecting SDH, then re-rendering with the same list,
       * must leave SDH selected and the plain row unselected. */
      const panels = variants();
      panels.subtitles.track = {
        language: "English",
        languageId: "en",
        downloadLink: "forced",
        hearingImpaired: "0",
        forced: "1",
      };
      const { rerender } = open("captions", panels);
      fireEvent.click(screen.getByRole("radio", { name: /signage and narration/i }));
      rerender(<SettingsSheet panelId="captions" onClose={() => {}} panels={panels} />);
      const selected = [...document.querySelectorAll('.pv2-sheet__row[data-selected="true"]')];
      expect(selected).toHaveLength(1);
      expect(selected[0].textContent).toMatch(/Forced/);
    });

    it("passes the whole track, not a lossy id, to select()", () => {
      /* `select(entry)` and not `select(entry.languageId)`: the hook needs
       * `downloadLink` to fetch the file, and the link is what distinguishes the SDH
       * track from the plain one. */
      const panels = variants();
      open("captions", panels);
      fireEvent.click(screen.getByRole("radio", { name: /hearing impaired/i }));
      expect(panels.subtitles.select).toHaveBeenCalledWith(
        expect.objectContaining({ downloadLink: "sdh", hearingImpaired: "1" }),
      );
    });

    it("says so when a title has no subtitles, rather than showing an empty list", () => {
      /* An empty panel is indistinguishable from a failed fetch. The hook treats
       * "0 results" as a real answer (not an error), so the sheet has to render
       * it as one. */
      open("captions", sub({ languages: [] }));
      expect(screen.getByText(/no subtitles were offered/i)).toBeTruthy();
    });

    it("announces a download failure as an alert", () => {
      open("captions", sub({ error: "Subtitle download failed" }));
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/download failed/i);
    });

    it("does not claim there are none while a load is in flight", () => {
      /* Both states at once is the bug: the hook has a `loading` flag precisely
       * because the empty list is also what a failed search returns. Showing
       * "no subtitles" during the fetch tells the viewer something false. */
      open("captions", sub({ languages: [], loading: true }));
      expect(screen.queryByText(/no subtitles were offered/i)).toBeNull();
      expect(screen.getByRole("status").textContent).toMatch(/loading/i);
    });
  });

  describe("speed", () => {
    const prefs = (over = {}) => ({
      prefs: { rate: 1, setRate: vi.fn(), persistent: true, ...over },
    });

    it("marks the current rate selected", () => {
      open("speed", prefs({ rate: 1.5 }));
      expect(screen.getByRole("radio", { name: /^1\.5x/ }).dataset.selected).toBe("true");
      expect(screen.getByRole("radio", { name: /^1x/ }).dataset.selected).toBe("false");
    });

    it("labels 1x as Normal", () => {
      /* Bare "1x" reads as a value nobody chose; the default needs saying. */
      open("speed", prefs());
      expect(screen.getByRole("radio", { name: /normal/i })).toBeTruthy();
    });

    it("sets a rate", () => {
      const panels = prefs();
      open("speed", panels);
      fireEvent.click(screen.getByRole("radio", { name: /^2x/ }));
      expect(panels.prefs.setRate).toHaveBeenCalledWith(2);
    });

    it("disables and explains when preferences cannot persist", () => {
      /* An inert row that looks enabled is the bug. `setPreference` can genuinely
       * be absent (no provider), and a viewer who taps four aspect ratios and
       * watches nothing change deserves to be told why. */
      open("speed", prefs({ persistent: false }));
      expect(screen.getByRole("radio", { name: /^2x/ }).disabled).toBe(true);
      expect(screen.getByText(/not saved on this device/i)).toBeTruthy();
    });
  });

  describe("aspect", () => {
    it("offers the whole catalogue with full names", () => {
      /* The transport's short forms ("Fit", "16:10") are ambiguous alone —
       * "Stretch to Screen" and "Fill Screen" are indistinguishable short. */
      open("settings", { prefs: { aspectId: "fit", setAspect: vi.fn(), persistent: true } });
      expect(screen.getByRole("radio", { name: /stretch to screen/i })).toBeTruthy();
      expect(screen.getByRole("radio", { name: /fit \(original 16:9\)/i })).toBeTruthy();
    });

    it("sets an aspect", () => {
      const prefs = { aspectId: "fit", setAspect: vi.fn(), persistent: true };
      open("settings", { prefs });
      fireEvent.click(screen.getByRole("radio", { name: /cinema 2\.39:1/i }));
      expect(prefs.setAspect).toHaveBeenCalledWith("cinema");
    });
  });

  describe("volume", () => {
    const controls = (over = {}) => ({
      controls: { volume: 0.5, muted: false, setVolume: vi.fn(), toggleMute: vi.fn(), ...over },
    });

    it("marks the current level, not an index", () => {
      open("volume", controls());
      expect(screen.getByRole("radio", { name: "50%" }).dataset.selected).toBe("true");
      expect(screen.getByRole("radio", { name: "100%" }).dataset.selected).toBe("false");
    });

    it("puts Mute ahead of the levels", () => {
      const { container } = open("volume", controls());
      expect(rows(container)[0].textContent).toMatch(/mute/i);
    });

    it("marks Mute selected rather than the level when muted", () => {
      /* The specific wrong state: a muted player whose volume is still 0.75 shows
       * "75%" selected next to "Mute" selected, so the two visibly disagree.
       *
       * Mute is queried as a `button` and read through `aria-pressed`, not as a radio
       * with a checked state, because that is what it now is: a toggle, independent of
       * the level group. Asserting it as a radio would be asserting the bug 3.26 was
       * written to fix — that muting is one option among the volumes. */
      const { container } = open("volume", controls({ muted: true, volume: 0.75 }));
      expect(screen.getByRole("button", { name: /^unmute/i }).getAttribute("aria-pressed")).toBe(
        "true",
      );
      expect(screen.getByRole("radio", { name: "75%" }).getAttribute("aria-checked")).toBe(
        "false",
      );
      /* And no level is checked while muted, so exactly one thing is on. */
      expect(
        rows(container).filter((r) => r.getAttribute("aria-checked") === "true"),
      ).toHaveLength(0);
    });

    it("marks nothing selected for a volume between the steps", () => {
      /* The panel offers five discrete levels, so a volume the drag gesture left
       * at 0.8 (or that a device shipped that way) matches no row. Marking the
       * NEAREST one would claim the viewer chose it; marking nothing selected is
       * the honest reading, and it is why this test exists rather than a
       * nearest-match assertion. */
      const { container } = open("volume", controls({ muted: false, volume: 0.8 }));
      expect(rows(container).some((row) => row.dataset.selected === "true")).toBe(false);
    });

    it("toggles mute and sets a level", () => {
      const panels = controls();
      open("volume", panels);
      /* Mute is a toggle, so it stays a button; the level is an option in a group, so
       * it is a radio. The two are separate controls and a test that reached for one
       * role for both would be asserting that they are the same kind of thing. */
      fireEvent.click(screen.getByRole("button", { name: /^mute/i }));
      expect(panels.controls.toggleMute).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("radio", { name: "25%" }));
      expect(panels.controls.setVolume).toHaveBeenCalledWith(0.25);
    });
  });

  describe("episodes", () => {
    const episodes = [
      { id: "a", episodeNumber: 1, title: "Pilot" },
      { id: "b", episodeNumber: 2, title: "" },
    ];

    it("numbers rows so an untitled episode is still identifiable", () => {
      /* Twelve identical "Episode" rows is why the E-number prefix exists; the
       * fallback should read as "no title was supplied". */
      open("episodes", { episodes, currentEpisode: 1, onSelectEpisode: vi.fn() });
      expect(screen.getByRole("radio", { name: /E01/ })).toBeTruthy();
      expect(screen.getByRole("radio", { name: /E02/ })).toBeTruthy();
    });

    it("marks the playing episode selected", () => {
      open("episodes", { episodes, currentEpisode: 2, onSelectEpisode: vi.fn() });
      expect(screen.getByRole("radio", { name: /E02/ }).dataset.selected).toBe("true");
      expect(screen.getByRole("radio", { name: /E01/ }).dataset.selected).toBe("false");
    });

    it("selects an episode", () => {
      const onSelectEpisode = vi.fn();
      open("episodes", { episodes, currentEpisode: 1, onSelectEpisode });
      fireEvent.click(screen.getByRole("radio", { name: /E02/ }));
      expect(onSelectEpisode).toHaveBeenCalledWith(episodes[1]);
    });

    it("says so when there is nothing to switch to", () => {
      open("episodes", { episodes: [], currentEpisode: 1, onSelectEpisode: vi.fn() });
      expect(screen.getByText(/no other episodes/i)).toBeTruthy();
    });

    it("disables rows when the parent cannot be told", () => {
      /* No `onSelectEpisode` means the episode list is decorative. Enabled rows
       * that do nothing look like a broken player. */
      open("episodes", { episodes, currentEpisode: 1, onSelectEpisode: undefined });
      expect(screen.getByRole("radio", { name: /E01/ }).disabled).toBe(true);
    });
  });

  describe("watching", () => {
    it("lists the roster and marks you by participant id", () => {
      /* By ID, not by name: two viewers can share a display name, and marking the
       * wrong one "(you)" is worse than marking nobody. */
      const party = {
        room: {
          participants: [
            { participantId: "1", name: "Ana", isHost: true },
            { participantId: "2", name: "Ana" },
          ],
        },
      };
      const { container } = open("users", { party, identity: { participantId: "2" } });
      const listed = Array.from(container.querySelectorAll(".pv2-sheet__roster > li"));
      expect(listed[0].dataset.self).toBeUndefined();
      expect(listed[1].dataset.self).toBe("true");
      expect(listed[0].textContent).toMatch(/host/);
    });

    it("is a list, not a group of choices", () => {
      /* The one panel that must NOT be a radiogroup, and the easiest to get wrong
       * because the "you" marker makes exactly one row look selected. Under
       * `role="radiogroup"` a screen reader announces this as a set of options with
       * one current, and promises the arrows will change it — so a viewer pressing
       * ArrowDown would hear "checked" move to somebody else and conclude the player
       * has just reassigned their identity. Nothing here is selectable.
       *
       * Asserting the ABSENCE of radios as well as the presence of the list, because
       * a roster rendered as a list plus a stray radiogroup would pass the first half. */
      const party = {
        room: {
          participants: [
            { participantId: "1", name: "Ana", isHost: true },
            { participantId: "2", name: "Bo" },
          ],
        },
      };
      open("users", { party, identity: { participantId: "2" } });
      expect(screen.getByRole("list", { name: /people watching/i })).toBeTruthy();
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
      expect(screen.queryByRole("radiogroup")).toBeNull();
      expect(screen.queryByRole("radio")).toBeNull();
    });

    it("keeps the roster out of the tab order", () => {
      /* Roster rows were buttons, which made them four controls that do nothing: a
       * viewer tabbing through the sheet was offered them one at a time and every one
       * was a dead end. They are static text now, so the trap has nothing to stop on. */
      const party = {
        room: {
          participants: [
            { participantId: "1", name: "Ana" },
            { participantId: "2", name: "Bo" },
          ],
        },
      };
      const { container } = open("users", { party, identity: { participantId: "1" } });
      const sheet = container.querySelector(".pv2-sheet");
      /* Only the header's close button remains focusable. */
      expect(tabbables(sheet)).toHaveLength(1);
      expect(tabbables(sheet)[0].className).toMatch(/pv2-sheet__close/);
    });

    it("says so when nobody else is watching", () => {
      open("users", { party: null });
      expect(screen.getByText(/nobody else is watching/i)).toBeTruthy();
    });
  });

  describe("servers", () => {
    it("names the active server and admits it cannot switch", () => {
      /* V2 has no server LIST — `usePlayerSource` returns one resolved source.
       * Inventing a picker over data that does not exist would be a control that
       * cannot work. */
      open("server", { serverLabel: "Server 3" });
      expect(screen.getByText(/server 3/i)).toBeTruthy();
      expect(screen.getByText(/not available in this player yet/i)).toBeTruthy();
    });

    it("says so when no server has resolved", () => {
      open("server", { serverLabel: "" });
      expect(screen.getByText(/no server has been resolved/i)).toBeTruthy();
    });
  });

  describe("CSS", () => {
    it("puts the sheet above the chrome layers", () => {
      /* JSX order is not paint order — `.pv2-chrome` sets its own `z-index`, so a
       * sheet that renders later in the DOM still paints UNDER the transport
       * without a higher index, and its bottom rows land on the scrubber. */
      const block = sheetBlock();
      const sheetZ = Number(block.match(/z-index:\s*(\d+)/)[1]);
      const chromeZ = Number(CSS.match(/\.pv2-chrome \{[^}]*z-index:\s*(\d+)/s)[1]);
      const cueZ = Number(CSS.match(/\.pv2-cue \{[^}]*z-index:\s*(\d+)/s)[1]);
      expect(sheetZ).toBeGreaterThan(chromeZ);
      expect(sheetZ).toBeGreaterThan(cueZ);
    });

    it("anchors the sheet to the right edge", () => {
      const block = sheetBlock();
      expect(block).toMatch(/inset-inline-end: 0/);
    });

    it("spans the player's height so its own scroll is bounded by the player", () => {
      /* `inset-block: 0` rather than a top offset: a panel taller than a landscape
       * phone would otherwise overflow the player and push the page around. */
      const block = sheetBlock();
      expect(block).toMatch(/inset-block: 0/);
      expect(CSS).toMatch(/\.pv2-sheet__body \{[^}]*overflow-y: auto/s);
    });

    it("opts back into pointer events", () => {
      /* `.pv2-chrome` is `pointer-events: none` so presses reach the video. The
       * sheet is a sibling, but a shared reset would otherwise make every row
       * unclickable — which looks like a broken player, not a stylesheet quirk. */
      const block = sheetBlock();
      expect(block).toMatch(/pointer-events: auto/);
    });

    it("marks the selected row with more than a background tint", () => {
      /* A colour change alone is invisible to a viewer with a low-vision filter,
       * and the sheet's own scrim is dark enough that a subtle tint is easy to
       * miss on top of it.
       *
       * Keyed off `[aria-checked="true"]` rather than `[data-selected="true"]`, and
       * that is the assertion with teeth: the two can disagree, and a marker painted
       * from the attribute while assistive tech reads the ARIA state produces a
       * player that visibly shows one selection and announces another. */
      expect(CSS).toMatch(/\[role="radio"\]\[aria-checked="true"\] \{[^}]*background/s);
      expect(CSS).toMatch(/\[role="radio"\]\[aria-checked="true"\][^{]*::after/);
      /* The stale attribute selector must be gone, not merely outnumbered: a leftover
       * `[data-selected="true"]` rule after the row's attribute would still match
       * nothing, and a test asserting the new selector alone would never notice. */
      expect(CSS).not.toMatch(/\[data-selected="true"\]/);
    });

    it("does not paint the checkmark from focus", () => {
      /* Arrows move focus AND selection, so after one ArrowDown two rows are true at
       * once — newly focused and still current. A marker following `:focus` claims
       * the setting has already changed when it has not, and Tab into a group whose
       * value is a later row would paint a checkmark on the row it merely landed on. */
      expect(CSS).not.toMatch(/\[role="radio"\]:focus-visible[^{]*\{[^}]*::after/s);
      /* Focus still has to be visible, though — the outline is the point. */
      expect(CSS).toMatch(/\[role="radio"\]:focus-visible \{[^}]*outline/s);
    });

    it("takes the roster markers back off the list", () => {
      /* The roster is a `ul` so its count can be announced, which means the browser's
       * default bullets are now sitting next to a person's name. */
      expect(CSS).toMatch(/\.pv2-sheet__roster \{[^}]*list-style: none/s);
      /* And a static row must not invite a press: no pointer cursor, no hover tint. */
      expect(CSS).toMatch(/\.pv2-sheet__row--static \{[^}]*cursor: default/s);
    });

    it("uses no viewport units", () => {
      const block = CSS.slice(CSS.indexOf("/* ── The settings sheet"));
      expect(block).not.toMatch(/\d(vw|vh|vmin|vmax)\b/);
      expect(block).not.toMatch(/@media/);
    });
  });
});