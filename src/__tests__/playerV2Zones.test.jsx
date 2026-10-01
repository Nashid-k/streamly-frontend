import { render, act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import TransportBar from "../components/player/v2/TransportBar";
import PlayerShell from "../components/player/v2/PlayerShell";
import {
  ALL_CONTROL_IDS,
  TOUCH_ZONE_LEFT,
  TOUCH_ZONE_RIGHT,
  TRANSPORT_MODE,
  absentControls,
  isPresentInTier,
  presentControlIds,
  zoneFor,
  zoneOrder,
  zonePushesToEnd,
} from "../components/player/v2/tiers";
import { MEDIA_QUERIES } from "../components/player/v2/inputCapability";
import { SKIP_SECONDS } from "../constants/playerUi";

/* Mirrors `playerV2Wiring.test.jsx`: the source ladder is mocked so the shell
 * reaches a resolved state and actually mounts the transport. Without this the
 * shell sits in LoadingStage forever and there is nothing to assert on. */
const mocks = vi.hoisted(() => ({ resolve: async () => ({}) }));
vi.mock("hls.js", () => {
  class FakeHls {
    static Events = { ERROR: "hlsError" };
    static isSupported() {
      return true;
    }
    on() {}
    off() {}
    loadSource() {}
    attachMedia() {}
    destroy() {}
  }
  return { default: FakeHls };
});
vi.mock("../constants/sources", () => ({
  PLAYER_SOURCES: [{ key: "one", label: "Server One", resolve: (a, o) => mocks.resolve(a, o) }],
}));
const PLAYABLE = {
  source: { url: "https://cdn.test/master.m3u8" },
  variants: [{ label: "1080p" }],
};

/* PLAYER V2 touch transport (task.md 3.11).
 *
 * The item is one line — "two thumb zones at the bottom corners, LEFT play /
 * -10s / +10s / speed, RIGHT captions / settings / fullscreen / close" — but it
 * has three separable claims, and only the first is obvious:
 *
 *  1. THE CONTROL SET. Verbatim from the item, in the item's order, on the right
 *     sides. A reordering here is invisible in review and expensive: these are
 *     muscle-memory positions for the exact audience the layout exists for.
 *
 *  2. THE LAYOUT MECHANISM. The zones layout positions controls with CSS `order`
 *     over ONE fixed DOM, never by re-sorting the DOM. That is 3.10's invariant
 *     surviving a second layout: switching input modality must not remount a
 *     node, because a remount drops focus and cancels an in-flight press at the
 *     moment the viewer is changing how they hold the device.
 *
 *  3. THE GAP BETWEEN THE CLUSTERS. Asserted as "exactly one control carries the
 *     auto margin, and it is the right cluster's first", because the two ways
 *     this can silently break — `space-between` scattering the left cluster
 *     across the width, or an auto margin on the left lead parking the whole
 *     thing at the end — both still render eight buttons.
 */

/** A controllable matchMedia, because jsdom answers `false` to everything. */
function installMatchMedia(initial = {}) {
  const state = { ...initial };
  const queries = new Map();
  window.matchMedia = vi.fn((query) => {
    if (!queries.has(query)) {
      const listeners = new Set();
      queries.set(query, {
        list: {
          media: query,
          get matches() {
            return Boolean(state[query]);
          },
          addEventListener: (_type, fn) => listeners.add(fn),
          removeEventListener: (_type, fn) => listeners.delete(fn),
        },
        listeners,
      });
    }
    return queries.get(query).list;
  });
  return state;
}

const COARSE = {
  [MEDIA_QUERIES.canHover]: false,
  [MEDIA_QUERIES.hasFine]: false,
  [MEDIA_QUERIES.hasCoarse]: true,
};
const FINE = {
  [MEDIA_QUERIES.canHover]: true,
  [MEDIA_QUERIES.hasFine]: true,
  [MEDIA_QUERIES.hasCoarse]: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

/* The present controls of a rendered transport, in the order they claim. */
const presentIn = (container) =>
  Array.from(container.querySelectorAll('.pv2-transport > *:not([data-presence="absent"])'));
const cssOrder = (el) => Number(el.style.getPropertyValue("--pv2-order"));
const byZone = (container, zone) =>
  container.querySelectorAll(`.pv2-transport [data-zone="${zone}"][data-presence="present"]`);

const V2_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "components", "player", "v2");
const readV2 = (name) => readFileSync(resolve(V2_DIR, name), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("the touch layout's control set", () => {
  it("is the item's control set, in the item's order", () => {
    // Verbatim from task.md 3.11. LEFT play · −10s · +10s · speed.
    //
    // 3.12 appends `volume` to the left cluster, so this is no longer the whole
    // 3.11 list. It is still checked as an exact array, and the first four are
    // asserted as a PREFIX below, because the property that actually matters is
    // that 3.12 did not reshuffle controls 3.11 had already placed: a viewer who
    // learned "speed is the fourth one" must not have to learn again.
    expect(TOUCH_ZONE_LEFT).toEqual(["play", "skipBack", "skipForward", "speed", "volume"]);
    // RIGHT captions · settings · fullscreen · close.
    expect(TOUCH_ZONE_RIGHT).toEqual(["captions", "settings", "fullscreen", "close"]);
  });

  it("keeps 3.11's left cluster as an unmoved prefix", () => {
    const three11 = ["play", "skipBack", "skipForward", "speed"];
    expect(TOUCH_ZONE_LEFT.slice(0, 3)).not.toBe(three11);
    expect(TOUCH_ZONE_LEFT.slice(0, 3 + 1)).toEqual(three11);
    // And 3.12 put its control LAST, not in a slot that would move a thumb.
    expect(TOUCH_ZONE_LEFT.at(-1)).toBe("volume");
  });

  it("puts five controls left and four right, with no overlap", () => {
    expect(TOUCH_ZONE_LEFT).toHaveLength(5);
    expect(TOUCH_ZONE_RIGHT).toHaveLength(4);
    // Overlap would put one control in two corners, which CSS `order` cannot
    // express — it would render in only one of them, silently.
    expect(TOUCH_ZONE_LEFT.filter((id) => TOUCH_ZONE_RIGHT.includes(id))).toEqual([]);
    expect(new Set([...TOUCH_ZONE_LEFT, ...TOUCH_ZONE_RIGHT]).size).toBe(9);
  });

  it("resolves every zone control to a corner, and nothing else to one", () => {
    TOUCH_ZONE_LEFT.forEach((id) => expect(zoneFor(id)).toBe("left"));
    TOUCH_ZONE_RIGHT.forEach((id) => expect(zoneFor(id)).toBe("right"));
    // Row-only controls must NOT claim a corner, or the zones stylesheet would
    // try to place a timecode into a thumb cluster. `volume` is no longer one of
    // them — 3.12 promoted it — so it is deliberately absent from this list.
    ["timecode", "scrubber", "aspect", "server", "users"].forEach((id) =>
      expect(zoneFor(id)).toBeNull(),
    );
    expect(zoneFor("nonsense")).toBeNull();
  });

  it("ignores the tier in zones mode", () => {
    // A tier answers "how much room is there"; the zones layout answers "what is
    // the viewer holding". A 900px tablet has room for all 14 controls and no use
    // for them, so zones mode must not inherit Tier B just because it is wide.
    expect(presentControlIds("A", TRANSPORT_MODE.ZONES)).toEqual([
      ...TOUCH_ZONE_LEFT,
      ...TOUCH_ZONE_RIGHT,
    ]);
    expect(presentControlIds("B", TRANSPORT_MODE.ZONES)).toEqual(
      presentControlIds("A", TRANSPORT_MODE.ZONES),
    );
    expect(presentControlIds("Z", TRANSPORT_MODE.ZONES)).toEqual(
      presentControlIds("A", TRANSPORT_MODE.ZONES),
    );
  });

  it("keeps the zone-only controls out of both tier spines", () => {
    // The three controls that belong to no tier, and the reason `isPresentInTier`
    // grew a `mode` argument instead of the tiers growing a third spine.
    ["skipBack", "skipForward", "close"].forEach((id) => {
      expect(isPresentInTier(id, "A")).toBe(false);
      expect(isPresentInTier(id, "B")).toBe(false);
      expect(isPresentInTier(id, "B", TRANSPORT_MODE.ZONES)).toBe(true);
    });
  });

  it("leaves the row mode untouched by zones", () => {
    // Row presence must be exactly what 3.9/3.10 decided, or the zones work
    // would have quietly regressed the desktop player.
    expect(presentControlIds("A", TRANSPORT_MODE.ROW)).not.toContain("skipBack");
    expect(presentControlIds("B", TRANSPORT_MODE.ROW)).toHaveLength(14);
    // 9 corner controls after 3.12 (was 8) — `volume` joined the left cluster.
    expect(absentControls("B", TRANSPORT_MODE.ZONES)).toHaveLength(ALL_CONTROL_IDS.length - 9);
  });
});

describe("zone order is CSS order, not DOM order", () => {
  it("ranks the left cluster 0-4 and the right cluster well clear", () => {
    // 3.11 froze left at 0-3 and right at 100-103. 3.12 appends, so the left
    // cluster grew by one at the TOP end — the four original orders are
    // unchanged, which is the property that keeps learned thumb positions valid.
    expect(TOUCH_ZONE_LEFT.map(zoneOrder)).toEqual([0, 1, 2, 3, 4]);
    expect(TOUCH_ZONE_RIGHT.map(zoneOrder)).toEqual([100, 101, 102, 103]);
  });

  it("keeps the two clusters from interleaving", () => {
    // The 100 offset is the whole reason the clusters cannot alternate: without
    // it, `speed` (3) would sort after `captions` and the corners would mix.
    const orders = [...TOUCH_ZONE_LEFT, ...TOUCH_ZONE_RIGHT].map(zoneOrder);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
    expect(Math.max(...TOUCH_ZONE_LEFT.map(zoneOrder))).toBeLessThan(
      Math.min(...TOUCH_ZONE_RIGHT.map(zoneOrder)),
    );
  });

  it("gives row-only controls a harmless order", () => {
    // They are absent in zones mode, so their order never paints — but it must
    // not be `undefined`, because CSS would fall back to `var(--pv2-order, 0)`
    // inconsistently depending on whether the property was emitted at all.
    expect(zoneOrder("timecode")).toBe(0);
    expect(zoneOrder("scrubber")).toBe(0);
  });

  it("designates exactly one control to create the gap, and it is the right lead", () => {
    const pushers = ALL_CONTROL_IDS.filter(zonePushesToEnd);
    expect(pushers).toEqual([TOUCH_ZONE_RIGHT[0]]);
    expect(zonePushesToEnd("play")).toBe(false);
    expect(zonePushesToEnd("skipBack")).toBe(false);
  });
});

describe("zones mode in the DOM", () => {
  it("stamps the mode on the one container", () => {
    const row = render(<TransportBar />);
    expect(row.container.querySelector(".pv2-transport").getAttribute("data-mode")).toBe(
      TRANSPORT_MODE.ROW,
    );
    const zones = render(<TransportBar mode={TRANSPORT_MODE.ZONES} />);
    expect(zones.container.querySelector(".pv2-transport").getAttribute("data-mode")).toBe(
      TRANSPORT_MODE.ZONES,
    );
  });

  it("renders the same node count in both modes — one DOM, not two layouts", () => {
    const count = (c) => c.container.querySelectorAll(".pv2-transport > *").length;
    expect(count(render(<TransportBar />))).toBe(count(render(<TransportBar mode="zones" />)));
  });

  it("does not remount anything when the mode changes", () => {
    // THE claim of 3.10 meeting 3.11. Asserted as node identity, not as equal
    // markup: a re-sorted array would produce identical-looking HTML while
    // throwing away every element — and the focus — that React had just mounted.
    const { container, rerender } = render(<TransportBar tier="B" />);
    const before = Array.from(container.querySelectorAll(".pv2-transport > *"));
    rerender(<TransportBar tier="B" mode={TRANSPORT_MODE.ZONES} />);
    const after = Array.from(container.querySelectorAll(".pv2-transport > *"));
    expect(after).toHaveLength(before.length);

    /* 3.12 EXCUSES exactly one control from this rule, and the exception is the
     * point rather than a hole in it. Volume is the one control whose job differs
     * by mode: row mode's is a mute toggle, zones mode's is the sheet entry that
     * displays the level (see the note at its `case "volume"`). Those are
     * different components — `IconButton` versus `ValueButton` — so React
     * remounts that slot, correctly. Every OTHER control must keep its identity,
     * which is what this loop now pins. If a second control ever starts
     * swapping components by mode, this fails and the shared-DOM claim is gone. */
    const volIndex = ALL_CONTROL_IDS.indexOf("volume");
    expect(volIndex).toBeGreaterThanOrEqual(0);
    before.forEach((el, i) => {
      if (i === volIndex) return;
      expect(after[i]).toBe(el);
    });
    // And the swapped one is genuinely a different element — the mute toggle
    // became the level-displaying sheet entry — rather than a silent remount of
    // an identical control.
    expect(after[volIndex]).not.toBe(before[volIndex]);
    expect(before[volIndex].className).toContain("pv2-icon-btn");
    expect(after[volIndex].className).toContain("pv2-value-btn");

    // And back, because a one-way transition is still a transition.
    rerender(<TransportBar tier="B" />);
    Array.from(container.querySelectorAll(".pv2-transport > *")).forEach((el, i) => {
      if (i === volIndex) return;
      expect(el).toBe(before[i]);
    });
  });

  it("clusters five controls left and four right", () => {
    const { container } = render(<TransportBar tier="B" mode={TRANSPORT_MODE.ZONES} />);
    expect(byZone(container, "left")).toHaveLength(5);
    expect(byZone(container, "right")).toHaveLength(4);
    // Total present is 9 — nothing else survives into the touch layout.
    expect(presentIn(container)).toHaveLength(9);
  });

  it("emits an increasing --pv2-order inside each cluster", () => {
    const { container } = render(<TransportBar tier="B" mode={TRANSPORT_MODE.ZONES} />);
    // Read from the DOM in DOCUMENT order and sort by the order it claims. The
    // document order is deliberately NOT the visual order — if it were, this test
    // would pass while proving nothing, because `order` would be redundant.
    ["left", "right"].forEach((zone) => {
      const orders = Array.from(byZone(container, zone))
        .map(cssOrder)
        .sort((a, b) => a - b);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
      expect(new Set(orders).size).toBe(orders.length);
    });
  });

  it("relies on `order`, not on document order", () => {
    const { container } = render(<TransportBar tier="B" mode={TRANSPORT_MODE.ZONES} />);
    const left = Array.from(byZone(container, "left")).map(cssOrder);
    // Document order puts `speed` third (it is a Tier B control and sort earlier
    // than the zones-only ids); visual order puts it last. If these ever match,
    // something is sorting the DOM instead of positioning it, and the shared-DOM
    // guarantee is quietly gone.
    expect(left).not.toEqual([...left].sort((a, b) => a - b));
    expect(left).toContain(0);
    expect(left).toContain(3);
  });

  it("puts the gap carrier on the right cluster's first control only", () => {
    const { container } = render(<TransportBar mode={TRANSPORT_MODE.ZONES} />);
    const pushes = container.querySelectorAll(".pv2-transport [data-zone-push='true']");
    expect(pushes).toHaveLength(1);
    expect(pushes[0].getAttribute("aria-label")).toBe("Subtitles");
    // `captions` leads the right cluster, so it is the one that eats the space.
    expect(cssOrder(pushes[0])).toBe(Math.min(...TOUCH_ZONE_RIGHT.map(zoneOrder)));
  });

  it("leaves the row's own controls absent and unfocusable", () => {
    const { container } = render(<TransportBar tier="B" mode={TRANSPORT_MODE.ZONES} />);
    // A scrubber a thumb cannot drag is furniture; 3.13-3.15 own the touch
    // scrubber, so here it is simply absent.
    [".pv2-timecode", ".pv2-scrubber"].forEach((sel) => {
      const el = container.querySelector(sel);
      expect(el.getAttribute("data-presence")).toBe("absent");
    });
    // Absent INTERACTIVE controls leave the tab order on the same paint. The clock is
    // deliberately excluded: it is text with no focus and no action, so it has
    // nothing to take out of the tab order, and hiding it from assistive tech
    // would hide the fact that playback is advancing.
    const absentInteractive = Array.from(
      container.querySelectorAll('[data-presence="absent"][aria-label]'),
    );
    expect(absentInteractive.length).toBeGreaterThan(0);
    absentInteractive.forEach((el) => {
      const who = el.getAttribute("aria-label");
      expect(el.getAttribute("aria-hidden"), `${who} must be hidden`).toBe("true");
      expect(el.hasAttribute("inert"), `${who} must be inert`).toBe(true);
      expect(el.getAttribute("tabindex"), `${who} must leave the tab order`).toBe("-1");
    });
  });
});

describe("the zones controls behave", () => {
  const zonesProps = (extra = {}) => ({
    mode: TRANSPORT_MODE.ZONES,
    tier: "B",
    currentTime: 30,
    duration: 120,
    ...extra,
  });

  it("names the skip buttons with their distance", () => {
    // An icon cannot convey "10 seconds", and the two skip glyphs deliberately
    // differ from the episode stepper's `SkipBack`/`SkipForward` — so the number
    // has to live in the name.
    render(<TransportBar {...zonesProps()} />);
    expect(screen.getByRole("button", { name: `Back ${SKIP_SECONDS} seconds` })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Forward ${SKIP_SECONDS} seconds` })).toBeTruthy();
    expect(SKIP_SECONDS).toBe(10);
  });

  it("skips in both directions by exactly SKIP_SECONDS", () => {
    const onSkip = vi.fn();
    render(<TransportBar {...zonesProps({ onSkip })} />);
    fireEvent.click(screen.getByRole("button", { name: `Back ${SKIP_SECONDS} seconds` }));
    fireEvent.click(screen.getByRole("button", { name: `Forward ${SKIP_SECONDS} seconds` }));
    expect(onSkip.mock.calls.map((c) => c[0])).toEqual([-SKIP_SECONDS, SKIP_SECONDS]);
  });

  it("disables a skip that would go nowhere instead of pressing and doing nothing", () => {
    const onSkip = vi.fn();
    const { rerender } = render(<TransportBar {...zonesProps({ currentTime: 0, onSkip })} />);
    const back = screen.getByRole("button", { name: `Back ${SKIP_SECONDS} seconds` });
    const forward = screen.getByRole("button", { name: `Forward ${SKIP_SECONDS} seconds` });
    expect(back.disabled).toBe(true);
    expect(forward.disabled).toBe(false);
    // A dead press is the failure 3.7's ordering test exists to prevent.
    fireEvent.click(back);
    expect(onSkip).not.toHaveBeenCalled();

    rerender(<TransportBar {...zonesProps({ currentTime: 120, onSkip })} />);
    expect(screen.getByRole("button", { name: `Back ${SKIP_SECONDS} seconds` }).disabled).toBe(false);
    expect(screen.getByRole("button", { name: `Forward ${SKIP_SECONDS} seconds` }).disabled).toBe(
      true,
    );
  });

  it("treats an unknown duration as not-at-the-end, not at-the-end", () => {
    // Live streams report `NaN`/`Infinity` until metadata lands. Disabling
    // forward-skip then would strand the viewer on an unseekable bar that
    // recovers a second later.
    const { rerender } = render(<TransportBar {...zonesProps({ currentTime: 5, duration: NaN })} />);
    expect(screen.getByRole("button", { name: `Forward ${SKIP_SECONDS} seconds` }).disabled).toBe(
      false,
    );
    rerender(<TransportBar {...zonesProps({ currentTime: 5, duration: Infinity })} />);
    expect(screen.getByRole("button", { name: `Forward ${SKIP_SECONDS} seconds` }).disabled).toBe(
      false,
    );
  });

  it("closes the player, and says so when it cannot", () => {
    const onClose = vi.fn();
    const { rerender } = render(<TransportBar {...zonesProps({ onClose })} />);
    const close = screen.getByRole("button", { name: "Close player" });
    expect(close.disabled).toBe(false);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);

    // No `onClose`: present and disabled with a reason, NOT missing. A fullscreen
    // video with no visible way out is a trap, and a control that vanishes when
    // a prop is forgotten hides the bug instead of surfacing it.
    rerender(<TransportBar {...zonesProps()} />);
    const orphan = screen.getByRole("button", { name: "Close player" });
    expect(orphan).toBeTruthy();
    expect(orphan.disabled).toBe(true);
    expect(orphan.getAttribute("title")).toBe("Closing the player is not available here");
  });

  it("keeps the zones cluster's existing controls wired", () => {
    // 3.11 adds three controls; it must not quietly unhook the five it reuses.
    const onTogglePlay = vi.fn();
    const onOpenSheet = vi.fn();
    const onToggleFullscreen = vi.fn();
    render(
      <TransportBar
        {...zonesProps({
          isPaused: true,
          onTogglePlay,
          onOpenSheet,
          onToggleFullscreen,
          canFullscreen: true,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Playback speed" }));
    fireEvent.click(screen.getByRole("button", { name: "Subtitles" }));
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    // Speed and captions are both sheet openers, and both must pass their id.
    expect(onOpenSheet.mock.calls.map((c) => c[0])).toEqual(["speed", "captions"]);
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
  });
});

describe("the stylesheet does the layout", () => {
  const css = stripComments(readV2("player.css"));

  it("positions zones with `order` over the existing DOM", () => {
    expect(css).toMatch(/\.pv2-transport\[data-mode="zones"\]\s*>\s*\*\s*\{[^}]*order:\s*var\(--pv2-order/);
  });

  it("creates the gap with a single auto margin, not space-between", () => {
    // `space-between` would scatter the four left controls across the width.
    expect(css).toMatch(
      /\.pv2-transport\[data-mode="zones"\]\s*>\s*\[data-zone-push="true"\]\s*\{[^}]*margin-inline-start:\s*auto/,
    );
    expect(css).not.toMatch(/\.pv2-transport\[data-mode="zones"\][^{]*\{[^}]*space-between/);
  });

  it("scopes the thumb hit size to present controls", () => {
    // These rules sit later in the file than the collapse rules; unscoped they
    // would win on equal specificity and hand absent controls a 44px box,
    // resurrecting the phantom gaps 3.10 removed.
    expect(css).toMatch(
      /\.pv2-transport\[data-mode="zones"\]\s+\.pv2-icon-btn\[data-presence="present"\][^{]*\{[^}]*inline-size:\s*var\(--pv2-touch-hit\)/,
    );
    expect(css).toMatch(/--pv2-touch-hit:\s*2\.75rem/);
  });

  it("respects 3.6 — no @media and no viewport units in the zones block", () => {
    const block = css.slice(css.indexOf('.pv2-transport[data-mode="zones"]'));
    expect(block).not.toMatch(/@media/);
    expect(block).not.toMatch(/[0-9](vw|vh|vmin|vmax)/);
  });

  it("clears the home indicator", () => {
    // `env()` with its `, 0px` fallback: the declaration has to be valid on a
    // browser that does not implement safe-area insets, or the whole zones
    // padding is dropped.
    expect(css).toMatch(/padding-block-end:\s*calc\([\s\S]{0,60}?env\(safe-area-inset-bottom,\s*0px\)\)/);
  });

  it("still gets reduced motion from the existing shell attribute", () => {
    // 3.6 banned adding an @media block, and reduced motion was already handled
    // globally. The zones rules add no animation, so nothing new is needed —
    // asserted so a future "let's fade the clusters in" does not skip the check.
    expect(css).toMatch(/\.pv2-shell\[data-reduce-motion="true"\]/);
  });
});

describe("the shell chooses the mode from live input", () => {
  /* The shell has to reach a resolved source before it mounts the transport at
   * all, so these go through the real ladder rather than a stubbed TransportBar. */
  const shell = async (extra = {}) => {
    mocks.resolve = async () => PLAYABLE;
    const out = render(
      <PlayerShell id="tt123" type="movie" title="Test" originalLanguage="en" {...extra} />,
    );
    await waitFor(() => expect(document.querySelector("video")).toBeTruthy());
    return out;
  };

  it("renders the row for a fine pointer", async () => {
    installMatchMedia(FINE);
    const { container } = await shell();
    expect(container.querySelector(".pv2-transport").getAttribute("data-mode")).toBe(
      TRANSPORT_MODE.ROW,
    );
  });

  it("renders the zones for a coarse pointer", async () => {
    installMatchMedia(COARSE);
    const { container } = await shell();
    const bar = container.querySelector(".pv2-transport");
    expect(bar.getAttribute("data-mode")).toBe(TRANSPORT_MODE.ZONES);
    expect(bar.querySelectorAll("[data-zone='left'][data-presence='present']")).toHaveLength(5);
    expect(bar.querySelectorAll("[data-zone='right'][data-presence='present']")).toHaveLength(4);
  });

  it("switches layout when the viewer starts using a finger", async () => {
    // The reason `useInputCapability` subscribes instead of sampling once: a
    // hybrid laptop whose viewer picks up a finger mid-title.
    installMatchMedia(FINE);
    const { container } = await shell();
    const bar = container.querySelector(".pv2-transport");
    expect(bar.getAttribute("data-mode")).toBe(TRANSPORT_MODE.ROW);
    window.dispatchEvent(
      Object.assign(new Event("pointerdown"), { pointerType: "touch" }),
    );
    await waitFor(() =>
      expect(container.querySelector(".pv2-transport").getAttribute("data-mode")).toBe(
        TRANSPORT_MODE.ZONES,
      ),
    );
  });

  it("skips relative to where the media element actually is", async () => {
    // The distinction `skipBy` exists for: React state moves only on `timeupdate`,
    // so it can be ~250ms stale, and a viewer tapping "-10s" repeatedly would
    // otherwise have every tap measured from the same stale base.
    //
    // The element and the rendered timecode are deliberately desynchronised here:
    // the element says 100:00 while the last `timeupdate` the shell saw said
    // 5:00. An implementation reading React state lands on 4:50; one reading the
    // element lands on 9:50. jsdom reports NaN for `duration`, so it is stubbed.
    installMatchMedia(COARSE);
    await shell();
    const el = document.querySelector("video");
    let t = 6000;
    Object.defineProperty(el, "currentTime", {
      configurable: true,
      get: () => t / 1000,
      set: (v) => {
        t = v * 1000;
      },
    });
    Object.defineProperty(el, "duration", { configurable: true, get: () => 7200 });
    // One `timeupdate` at 6s, then the element advances to 12s WITHOUT one — so the
    // shell's `currentTime` state is stale at 6 while the element reads 12.
    act(() => {
      el.dispatchEvent(new Event("timeupdate"));
    });
    t = 12000;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `Forward ${SKIP_SECONDS} seconds` }));
    });
    // Element-based: 12 + 10 = 22. State-based would have produced 6 + 10 = 16,
    // landing the viewer ten seconds earlier than the button promised.
    expect(el.currentTime).toBeCloseTo(22, 3);
  });

  it("forwards the parent's close handler to the zones' close control", async () => {
    installMatchMedia(COARSE);
    const onClose = vi.fn();
    await shell({ onClose });
    // The prop was frozen with no consumer until 3.11; this is its test.
    const close = screen.getByRole("button", { name: "Close player" });
    expect(close.disabled).toBe(false);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the zones' close disabled when the parent offers no way out", async () => {
    installMatchMedia(COARSE);
    await shell();
    expect(screen.getByRole("button", { name: "Close player" }).disabled).toBe(true);
  });
});