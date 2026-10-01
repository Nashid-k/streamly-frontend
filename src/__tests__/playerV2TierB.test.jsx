import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TransportBar from "../components/player/v2/TransportBar";
import {
  DEFAULT_TIER,
  SHEET_OPENERS,
  TIER_A_CONTROLS,
  TIER_B_CONTROLS,
  TIER_B_MIN_WIDTH,
  controlsForTier,
  isSheetOpener,
  resolveTier,
} from "../components/player/v2/tiers";
import { formatRate, nextRate } from "../components/player/v2/rate";
import { PLAYER_SPEEDS, snapPlaybackRate } from "../constants/playerUi";
import {
  DEFAULT_ASPECT_ID,
  LEGACY_ASPECT_KEY,
  aspectIdFromIndex,
  aspectIndexFromId,
  aspectNameForId,
  aspectShortNameForId,
  aspectStyleForId,
  nextAspectId,
  normalizeAspectId,
  readLegacyAspectId,
} from "../components/player/v2/aspect";

/* PLAYER V2 Tier B transport (task.md 3.9).
 *
 * Same shape of assertion as 3.7's suite — order, accessible names, availability
 * — because those are the claims a screen reader makes out loud and a viewer
 * relies on by muscle memory. The parts worth reading twice:
 *
 *  - `resolveTier` is a TRUTH TABLE, not a conditional buried in the shell. Two
 *    gates must both pass, and the unknown-width fallback is asserted because
 *    "we could not measure" must never mean "show everything".
 *  - The availability of prev/next is asserted for UNDEFINED props, not just
 *    false ones. A movie passes no canGoPrev at all, and treating that as
 *    "allowed" would ship a live-looking button that does nothing.
 *  - Every id in BOTH tier lists is asserted to actually render. `TransportBar`
 *    returns null for an unknown id, which is silent — so this is the check that
 *    stops a control from being added to the spine and never appearing.
 */

/** Accessible name of every control in the rendered row, in DOM order.
 *
 *  Filters out `data-presence="absent"`. Since 3.10 the transport always renders
 *  the FULL superset and expresses the tier as presence, so a Tier A row still
 *  contains the seven Tier B controls — they are simply not part of it. Reading
 *  them as if they were would make every ordering assertion meaningless. */
function renderedOrder(container) {
  return Array.from(
    container.querySelectorAll(
      '.pv2-transport button:not([data-presence="absent"]), ' +
        '.pv2-transport span:not(.pv2-timecode):not([data-presence="absent"])',
    ),
  )
    .filter((el) => el.getAttribute("aria-label"))
    .map((el) => el.getAttribute("aria-label"));
}

describe("resolveTier — the truth table", () => {
  it("offers Tier B only when engaged AND there is room", () => {
    expect(resolveTier({ width: 1200, engaged: true })).toBe("B");
    expect(resolveTier({ width: 1200, engaged: false })).toBe(DEFAULT_TIER);
    expect(resolveTier({ width: 320, engaged: true })).toBe(DEFAULT_TIER);
  });

  it("falls back to Tier A whenever the width is unknown", () => {
    // "Not measured yet", "collapsed", "ResizeObserver absent". A control set
    // that cannot be shown in full is worse than a smaller one, because
    // truncation moves targets under the viewer's finger.
    expect(resolveTier({ width: null, engaged: true })).toBe(DEFAULT_TIER);
    expect(resolveTier({ width: 0, engaged: true })).toBe(DEFAULT_TIER);
    expect(resolveTier({ width: undefined, engaged: true })).toBe(DEFAULT_TIER);
    expect(resolveTier({ width: NaN, engaged: true })).toBe(DEFAULT_TIER);
    expect(resolveTier({ engaged: true })).toBe(DEFAULT_TIER);
  });

  it("treats the width floor as inclusive", () => {
    expect(resolveTier({ width: TIER_B_MIN_WIDTH, engaged: true })).toBe("B");
    expect(resolveTier({ width: TIER_B_MIN_WIDTH - 1, engaged: true })).toBe(DEFAULT_TIER);
  });

  it("maps unknown tiers to the compact set", () => {
    expect(controlsForTier("A")).toBe(TIER_A_CONTROLS);
    expect(controlsForTier("B")).toBe(TIER_B_CONTROLS);
    expect(controlsForTier("Z")).toBe(TIER_A_CONTROLS);
    expect(controlsForTier(undefined)).toBe(TIER_A_CONTROLS);
  });

  it("keeps Tier A's spine in the same relative order inside Tier B", () => {
    // The reason Tier B is built around Tier A rather than as a fresh list: a
    // viewer who learned where the scrubber sits must not relearn it.
    const bIndices = TIER_A_CONTROLS.map((id) => TIER_B_CONTROLS.indexOf(id));
    expect(bIndices.every((i) => i >= 0)).toBe(true);
    const sorted = [...bIndices].sort((a, b) => a - b);
    expect(bIndices).toEqual(sorted);
  });

  it("puts navigation before the spine and the environment after it", () => {
    expect(TIER_B_CONTROLS.indexOf("episodes")).toBeLessThan(TIER_B_CONTROLS.indexOf("play"));
    expect(TIER_B_CONTROLS.indexOf("nextEpisode")).toBeLessThan(TIER_B_CONTROLS.indexOf("play"));
    expect(TIER_B_CONTROLS.indexOf("volume")).toBeLessThan(TIER_B_CONTROLS.indexOf("speed"));
    expect(TIER_B_CONTROLS.indexOf("fullscreen")).toBe(TIER_B_CONTROLS.length - 1);
  });

  it("does not duplicate a control between the tiers' additions", () => {
    const added = TIER_B_CONTROLS.filter((id) => !TIER_A_CONTROLS.includes(id));
    expect(new Set(added).size).toBe(added.length);
  });
});

describe("every control id renders", () => {
  it("renders all seven Tier A controls", () => {
    const { container } = render(<TransportBar />);
    expect(renderedOrder(container)).toEqual([
      "Play",
      "Mute",
      "Subtitles",
      "Settings",
      "Fullscreen",
    ]);
    // timecode + scrubber are not buttons; assert them by their own roles/classes.
    expect(container.querySelector(".pv2-timecode")).toBeTruthy();
    expect(screen.getByRole("slider")).toBeTruthy();
    expect(TIER_A_CONTROLS).toHaveLength(7);
  });

  it("renders all fourteen Tier B controls", () => {
    const { container } = render(
      <TransportBar tier="B" rate={1.5} aspectShortName="Fill" serverLabel="Server 3" partyCount={2} />,
    );
    expect(container.querySelector(".pv2-transport").getAttribute("data-tier")).toBe("B");
    // Note `aspectShortName` with NO `aspectLabel`: this also asserts the derived
    // fallback, which must never be less informative than the visible "Fill".
    expect(renderedOrder(container)).toEqual([
      "Episodes",
      "Previous episode",
      "Next episode",
      "Play",
      "Mute",
      "Playback speed",
      "Aspect ratio: Fill",
      "Subtitles",
      "Servers",
      "Watch Party, 2 watching",
      "Settings",
      "Fullscreen",
    ]);
    expect(container.querySelector(".pv2-timecode")).toBeTruthy();
    expect(screen.getByRole("slider")).toBeTruthy();
    expect(TIER_B_CONTROLS).toHaveLength(14);
  });

  it("gives every Tier B id a case, so none renders as nothing", () => {
    // `TransportBar`'s default branch returns null, which is silent. If an id is
    // added to a tier list without a case, the row just gets shorter.
    ["episodes", "prevEpisode", "nextEpisode", "speed", "aspect", "captions", "server", "users"]
      .forEach((id) => {
        expect(TIER_B_CONTROLS).toContain(id);
      });
    const { container } = render(<TransportBar tier="B" />);
    // 14 ids, of which timecode is a span and scrubber is a slider => 12 buttons.
    // Counted as PRESENT, since the superset is always rendered (3.10).
    expect(container.querySelectorAll('.pv2-transport button:not([data-presence="absent"])'))
      .toHaveLength(12);
  });

  it("renders one element for both tiers, not two layouts", () => {
    const { container, rerender } = render(<TransportBar tier="A" />);
    const only = container.querySelectorAll(".pv2-transport");
    expect(only).toHaveLength(1);
    rerender(<TransportBar tier="B" />);
    expect(container.querySelectorAll(".pv2-transport")).toHaveLength(1);
  });
});

describe("Tier B availability is honest", () => {
  it("disables prev/next when the parent passes nothing at all", () => {
    // A movie passes no canGoPrev/canGoNext. Treating `undefined` as "allowed"
    // would ship a live-looking button that does nothing — the dead-control
    // failure 3.7's ordering test exists to prevent.
    render(<TransportBar tier="B" />);
    expect(screen.getByRole("button", { name: "Previous episode" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Next episode" }).disabled).toBe(true);
  });

  it("enables only the direction the parent allows", () => {
    // Last episode: next is off, prev is on. This is the shape that matters —
    // the two are independent, and a test enabling both proves nothing.
    render(<TransportBar tier="B" canGoPrev onGoPrev={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Previous episode" }).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Next episode" }).disabled).toBe(true);
  });

  it("calls the parent's own handlers", () => {
    const onGoPrev = vi.fn();
    const onGoNext = vi.fn();
    render(<TransportBar tier="B" canGoPrev canGoNext onGoPrev={onGoPrev} onGoNext={onGoNext} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous episode" }));
    fireEvent.click(screen.getByRole("button", { name: "Next episode" }));
    expect(onGoPrev).toHaveBeenCalledTimes(1);
    expect(onGoNext).toHaveBeenCalledTimes(1);
  });

  it("explains why a control is unavailable instead of hiding it", () => {
    const bare = render(<TransportBar tier="B" />);
    const episodes = within(bare.container).getByRole("button", { name: "Episodes" });
    expect(episodes.disabled).toBe(true);
    expect(episodes.getAttribute("title")).toMatch(/no episode list/i);
    // No series navigation at all reads differently from "at the first episode",
    // because they are different situations with the same visible result.
    expect(within(bare.container).getByRole("button", { name: "Previous episode" })
      .getAttribute("title")).toMatch(/not available for this title/i);

    const atStart = render(<TransportBar tier="B" canGoPrev />);
    expect(within(atStart.container).getByRole("button", { name: "Previous episode" })
      .getAttribute("title")).toMatch(/Previous episode/);
  });

  it("enables episodes only when there is a list", () => {
    render(<TransportBar tier="B" hasEpisodes />);
    expect(screen.getByRole("button", { name: "Episodes" }).disabled).toBe(false);
  });
});

describe("Tier B controls report their own state", () => {
  it("shows the rate, formatted, and opens its panel", () => {
    const onOpenSheet = vi.fn();
    render(<TransportBar tier="B" rate={1.5} onOpenSheet={onOpenSheet} />);
    const btn = screen.getByRole("button", { name: "Playback speed" });
    expect(btn.textContent).toContain("1.5x");
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(btn);
    expect(onOpenSheet).toHaveBeenCalledWith("speed");
  });

  it("cycles aspect immediately, with the full name in the accessible name", () => {
    // Aspect is an immediate action, not a sheet opener: the legacy rail cycled
    // it, so a cycling control has no dead state to guard against.
    const onCycleAspect = vi.fn();
    render(
      <TransportBar
        tier="B"
        aspectShortName="Fit"
        aspectLabel="Aspect ratio: Fit (Original 16:9)"
        onCycleAspect={onCycleAspect}
      />,
    );
    const btn = screen.getByRole("button", { name: "Aspect ratio: Fit (Original 16:9)" });
    expect(btn.textContent).toContain("Fit");
    expect(btn.getAttribute("aria-haspopup")).toBeNull();
    fireEvent.click(btn);
    expect(onCycleAspect).toHaveBeenCalledTimes(1);
  });

  it("names the active server, and counts the party", () => {
    const onOpenSheet = vi.fn();
    render(
      <TransportBar
        tier="B"
        serverLabel="Server 3"
        partyCount={4}
        onOpenSheet={onOpenSheet}
      />,
    );
    const server = screen.getByRole("button", { name: "Servers" });
    expect(server.textContent).toContain("Server 3");
    expect(server.getAttribute("title")).toMatch(/Server 3/);
    // The count is in the accessible name: "Watch Party" alone tells a screen
    // reader nothing about whether anyone else is watching.
    expect(screen.getByRole("button", { name: "Watch Party, 4 watching" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Watch Party, 4 watching" }));
    expect(onOpenSheet).toHaveBeenCalledWith("users");
  });

  it("does not say '0 watching'", () => {
    render(<TransportBar tier="B" partyCount={0} />);
    expect(screen.getByRole("button", { name: "Watch Party" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /0 watching/ })).toBeNull();
  });

  it("marks every sheet opener, and nothing else", () => {
    const { container } = render(
      <TransportBar tier="B" hasEpisodes canGoPrev canGoNext onCycleAspect={vi.fn()} />,
    );
    const withPopup = Array.from(container.querySelectorAll("button"))
      .filter((b) => b.getAttribute("aria-haspopup") === "dialog")
      .map((b) => b.getAttribute("aria-label"));
    ["Episodes", "Playback speed", "Subtitles", "Servers", "Watch Party", "Settings"]
      .forEach((label) => expect(withPopup).toContain(label));
    // Play, scrubber, mute, aspect and fullscreen are immediate actions.
    expect(withPopup).not.toContain("Play");
    expect(withPopup).not.toContain("Mute");
    expect(withPopup).not.toContain("Fullscreen");
  });

  it("keeps SHEET_OPENERS and the aria it produces in step", () => {
// 3.12 appends the volume sheet entry; see the note at `SHEET_OPENERS` in
    // `tiers.js` for why the order is append-only. R4.1 appends `audio` last.
    expect(SHEET_OPENERS).toEqual([
      "captions",
      "settings",
      "speed",
      "episodes",
      "users",
      "server",
      "volume",
      "audio",
    ]);
    SHEET_OPENERS.forEach((id) => expect(isSheetOpener(id)).toBe(true));
    expect(isSheetOpener("play")).toBe(false);
    expect(isSheetOpener("aspect")).toBe(false);
  });
});

describe("formatRate and nextRate", () => {
  it("writes one spelling per value", () => {
    expect(formatRate(0.5)).toBe("0.5x");
    expect(formatRate(1)).toBe("1x");
    expect(formatRate(1.25)).toBe("1.25x");
    expect(formatRate(2)).toBe("2x");
  });

  it("strips trailing zeros, because 1 and 1.0 are the same number", () => {
    // A settings page listing "1x" beside a player showing "1.0x" looks broken.
    expect(formatRate(1.0)).toBe("1x");
    expect(formatRate(1.5)).toBe("1.5x");
  });

  it("never renders NaN into the transport", () => {
    expect(formatRate(NaN)).toBe("1x");
    expect(formatRate(undefined)).toBe("1x");
    expect(formatRate("nonsense")).toBe("1x");
  });

  it("walks the ladder and wraps", () => {
    expect(nextRate(1)).toBe(1.25);
    expect(nextRate(2)).toBe(0.5);
    expect(nextRate(0.5)).toBe(0.75);
  });

  it("sends an off-ladder rate to the rung the sanitiser already chose", () => {
    // `nextRate` and the preferences sanitiser used to disagree about 1.37 — one
    // sent it to Normal, the other to the nearest rung — so the step direction
    // depended on which one ran last. Both now delegate to `snapPlaybackRate`.
    expect(snapPlaybackRate(1.37)).toBe(1.25);
    expect(nextRate(1.37)).toBe(1.5);
    expect(nextRate(9.99)).toBe(1.25); // 9.99 → default 1 → next rung
  });

  it("agrees with the sanitiser for every rung", () => {
    PLAYER_SPEEDS.forEach((rate, i) => {
      expect(snapPlaybackRate(rate)).toBe(rate);
      expect(nextRate(rate))
        .toBe(PLAYER_SPEEDS[(i + 1) % PLAYER_SPEEDS.length]);
    });
  });

  it("falls back to Normal outside the ladder's span", () => {
    // Inside the span we snap to the nearest rung, because a viewer who stored
    // 1.37 almost certainly meant 1.25. Outside it there is no such signal: 9.99
    // is garbage, and 2x is no more of a reading than 0.5x. Matches the aspect
    // precedent — an out-of-range index falls back rather than being guessed at.
    expect(snapPlaybackRate(9.99)).toBe(1);
    expect(snapPlaybackRate(0.1)).toBe(1);
    expect(snapPlaybackRate(-2)).toBe(1);
    expect(snapPlaybackRate(NaN)).toBe(1);
    expect(snapPlaybackRate("garbage")).toBe(1);
  });

  it("keeps the endpoints, because those are real speeds", () => {
    expect(snapPlaybackRate(0.5)).toBe(0.5);
    expect(snapPlaybackRate(2)).toBe(2);
  });
});

describe("aspect preference", () => {
  it("stores ids, and resolves them back to indices", () => {
    expect(aspectIdFromIndex(0)).toBe(DEFAULT_ASPECT_ID);
    expect(aspectIndexFromId(DEFAULT_ASPECT_ID)).toBe(0);
    expect(aspectIdFromIndex(3)).toBe("cinema");
    expect(aspectIndexFromId("cinema")).toBe(3);
  });

  it("falls back to the default for anything unusable", () => {
    expect(aspectIdFromIndex(-1)).toBe(DEFAULT_ASPECT_ID);
    expect(aspectIdFromIndex(99)).toBe(DEFAULT_ASPECT_ID);
    expect(aspectIdFromIndex(1.5)).toBe(DEFAULT_ASPECT_ID);
    expect(aspectIndexFromId("nonsense")).toBe(0);
    expect(normalizeAspectId("nonsense")).toBe(DEFAULT_ASPECT_ID);
    expect(normalizeAspectId(undefined)).toBe(DEFAULT_ASPECT_ID);
  });

  it("gives every id a name and a short name", () => {
    ["fit", "fill", "zoom", "cinema", "crop1610", "stretch"].forEach((id) => {
      const full = aspectNameForId(id);
      const short = aspectShortNameForId(id);
      expect(full).toBeTruthy();
      // The short form exists because the full one does not fit the row, so
      // "never longer" is the property that matters — not an arbitrary character
      // budget that "Stretch" would fail while still fitting comfortably.
      expect(short.length).toBeLessThanOrEqual(full.length);
      expect(short).toBe(short.trim());
      // And it is SHORTER wherever the full name had anything to trim.
      if (full.includes(" ") || full.includes("(")) {
        expect(short.length).toBeLessThan(full.length);
      }
    });
    // "16:10" is already the shortest possible name, so it is its own short form.
    expect(aspectShortNameForId("crop1610")).toBe("16:10");
    expect(aspectNameForId("crop1610")).toBe("16:10");
  });

  it("delegates the style instead of deriving it from the catalogue scale", () => {
    // `ASPECT_RATIOS[1].scale` is 1.25 but `ASPECT_VIDEO_STYLE.fill.scale` is 1.
    // Computing a transform from the catalogue would punch "Fill" in by 25% where
    // the shipped player does not.
    expect(aspectStyleForId("fill")).toEqual({ objectFit: "cover" });
    expect(aspectStyleForId("zoom")).toEqual({ objectFit: "contain", transform: "scale(1.25)" });
  });

  it("cycles through every mode and wraps back to the start", () => {
    const seen = [DEFAULT_ASPECT_ID];
    for (let i = 0; i < 5; i += 1) seen.push(nextAspectId(seen[seen.length - 1]));
    expect(new Set(seen).size).toBe(6);
    expect(nextAspectId("stretch")).toBe(DEFAULT_ASPECT_ID);
  });

  it("migrates the frozen legacy index key", () => {
    const storage = { getItem: (k) => (k === LEGACY_ASPECT_KEY ? "3" : null) };
    expect(readLegacyAspectId(storage)).toBe("cinema");
  });

  it("returns null when the legacy key is absent, so the default still applies", () => {
    // The caller must be able to tell "never chose an aspect" from "stored value
    // was garbage" — only the second should force the default.
    expect(readLegacyAspectId({ getItem: () => null })).toBeNull();
    expect(readLegacyAspectId(null)).toBeNull();
  });

  it("falls back to the default ratio for an out-of-range legacy index", () => {
    // architecture.md:92-94 prescribes exactly this: fall back rather than guess.
    // An index of 99 tells us nothing about the viewer's intent.
    expect(readLegacyAspectId({ getItem: () => "99" })).toBe(DEFAULT_ASPECT_ID);
    expect(readLegacyAspectId({ getItem: () => "-1" })).toBe(DEFAULT_ASPECT_ID);
    expect(readLegacyAspectId({ getItem: () => "garbage" })).toBe(DEFAULT_ASPECT_ID);
  });

  it("never throws when storage is unavailable", () => {
    expect(readLegacyAspectId({
      getItem: () => { throw new Error("privacy mode"); },
    })).toBeNull();
  });
});
