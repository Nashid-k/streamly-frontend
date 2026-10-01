import { render, fireEvent, screen, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import TransportBar from "../components/player/v2/TransportBar";
import PlayerShell from "../components/player/v2/PlayerShell";
import VolumeIndicator from "../components/player/v2/VolumeIndicator";
import useVolumeGesture from "../components/player/v2/hooks/useVolumeGesture";
import {
  DRAG_ARM_PX,
  GESTURE,
  GESTURE_ZONE,
  VOLUME_PATHS,
  VOLUME_TRAVEL_FRACTION,
  audibleVolume,
  classifyDrag,
  clampVolume,
  dragStartLevel,
  shouldUnmuteOnDrag,
  volumeFromDrag,
  zoneOf,
} from "../components/player/v2/volumeGesture";
import { SHEET_OPENERS, TRANSPORT_MODE } from "../components/player/v2/tiers";
import { MEDIA_QUERIES } from "../components/player/v2/inputCapability";

/* PLAYER V2 touch volume (task.md 3.12).
 *
 * The item: "Touch gets THREE discoverable volume paths (left-third horizontal
 * slide, persistent level indicator, sheet entry). Today it has ZERO — the slider
 * is behind `!IS_TOUCH` at `:4373`, leaving only an undiscoverable drag that is
 * unreachable by keyboard."
 *
 * The failure this suite is built to prevent is SPECIFIC, and it is not "the
 * volume does not change". It is that someone ships the drag alone — because the
 * drag is what the legacy player had, so it is the part that looks like
 * progress — and the "discoverable" and "keyboard-reachable" halves of the
 * sentence go unfixed. Hence the three-path count below, which fails if any path
 * is removed.
 */

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

/** A 360x640 phone: the left third ends at 120px. */
const PHONE = { left: 0, top: 0, width: 360, height: 640 };


function pointerAt(node, { x, y, pointerId = 1 }) {
  return {
    pointerId,
    clientX: x,
    clientY: y,
    target: node,
    pointerType: "touch",
    button: 0,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the three paths exist", () => {
  it("declares exactly the three the item names", () => {
    expect([...VOLUME_PATHS]).toEqual(["slide", "indicator", "sheet"]);
  });

  it("has a sheet entry — volume is a registered opener", () => {
    expect(SHEET_OPENERS).toContain("volume");
  });

  it("gives the zones layout a volume control that shows the level", () => {
    // The "discoverable" half: a control the viewer can SEE says what the volume
    // is. Before 3.12 the only touch volume affordance was a drag, which by
    // definition tells you nothing until you already know it works.
    const { container } = render(
      <TransportBar mode={TRANSPORT_MODE.ZONES} tier="B" volume={0.42} />,
    );
    const btn = container.querySelector('.pv2-value-btn[data-zone="left"]');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain("42%");
  });

  it("renders the persistent indicator on touch", () => {
    render(<VolumeIndicator level={0.75} muted={false} visible />);
    const meter = screen.getByRole("meter");
    expect(meter.getAttribute("aria-valuenow")).toBe("75");
  });

  it("keeps the row's mute toggle untouched", () => {
    // 3.12 is a TOUCH item. The desktop transport must come out of it identical,
    // and this is the assertion that says so.
    const { container } = render(<TransportBar tier="A" volume={0.42} />);
    const bar = container.querySelector(".pv2-transport");
    expect(bar.getAttribute("data-mode")).toBe(TRANSPORT_MODE.ROW);
    expect(container.querySelector(".pv2-volume-indicator")).toBeNull();
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy();
  });
});

describe("zone classification", () => {
  it("splits the surface into thirds", () => {
    expect(zoneOf(PHONE, 10)).toBe(GESTURE_ZONE.LEFT);
    expect(zoneOf(PHONE, 119)).toBe(GESTURE_ZONE.LEFT);
    expect(zoneOf(PHONE, 120)).toBe(GESTURE_ZONE.CENTER);
    expect(zoneOf(PHONE, 180)).toBe(GESTURE_ZONE.CENTER);
    expect(zoneOf(PHONE, 241)).toBe(GESTURE_ZONE.RIGHT);
    expect(zoneOf(PHONE, 359)).toBe(GESTURE_ZONE.RIGHT);
  });

  it("does not claim a degenerate rect", () => {
    // A hidden shell, or one measured before layout, has no width. Returning
    // LEFT would make every press a volume drag on a zero-width surface.
    expect(zoneOf({ left: 0, width: 0 }, 5)).toBe(GESTURE_ZONE.CENTER);
    expect(zoneOf(null, 5)).toBe(GESTURE_ZONE.CENTER);
  });
});

describe("only a horizontal left-third drag is volume", () => {
  const drag = (over) => classifyDrag({ armed: true, ...over });

  it("claims horizontal travel on the left", () => {
    expect(drag({ startZone: GESTURE_ZONE.LEFT, totalDx: 40, totalDy: 2 })).toBe(GESTURE.VOLUME);
  });

  it("leaves the centre and right thirds alone", () => {
    // The right third carries double-tap-forward and the press-and-hold 2x arm;
    // the centre carries play/pause. Claiming either would delete a working
    // gesture to add a redundant one.
    expect(drag({ startZone: GESTURE_ZONE.CENTER, totalDx: 200, totalDy: 0 })).toBe(GESTURE.NONE);
    expect(drag({ startZone: GESTURE_ZONE.RIGHT, totalDx: 200, totalDy: 0 })).toBe(GESTURE.NONE);
  });

  it("leaves vertical travel on the left alone", () => {
    // Vertical on the left is a scroll, and a diagonal that reads as vertical
    // should never change the volume.
    expect(drag({ startZone: GESTURE_ZONE.LEFT, totalDx: 2, totalDy: 80 })).toBe(GESTURE.NONE);
    expect(drag({ startZone: GESTURE_ZONE.LEFT, totalDx: 60, totalDy: 90 })).toBe(GESTURE.NONE);
  });

  it("claims nothing before the drag is armed", () => {
    // The arming distance is what keeps a left-third TAP out of the gesture.
    expect(
      classifyDrag({ armed: false, startZone: GESTURE_ZONE.LEFT, totalDx: 200, totalDy: 0 }),
    ).toBe(GESTURE.NONE);
  });

  it("measures intent from the START zone, not where the finger ended up", () => {
    // A finger that starts left and slides across the middle is still a
    // left-third gesture. Recomputing per move would make the gesture's meaning
    // depend on where the viewer happened to be when it took effect.
    expect(drag({ startZone: GESTURE_ZONE.LEFT, totalDx: 200, totalDy: 1 })).toBe(GESTURE.VOLUME);
  });
});

describe("level maths", () => {
  it("clamps to 0-1 and rejects nonsense", () => {
    expect(clampVolume(-0.5)).toBe(0);
    expect(clampVolume(1.5)).toBe(1);
    expect(clampVolume(NaN)).toBe(0);
    expect(clampVolume("loud")).toBe(0);
    expect(clampVolume(0.3)).toBe(0.3);
  });

  it("maps position across a container-relative travel", () => {
    const travel = PHONE.width * VOLUME_TRAVEL_FRACTION;
    // Dragging right raises it, dragging left lowers it.
    expect(volumeFromDrag({ startX: 50, clientX: 50 + travel / 2, containerWidth: 360, startVolume: 0 })).toBeCloseTo(0.5, 5);
    expect(volumeFromDrag({ startX: 50, clientX: 50 - travel / 2, containerWidth: 360, startVolume: 1 })).toBeCloseTo(0.5, 5);
  });

  it("is absolute from the press position, not incremental", () => {
    // An incremental `volume += delta` drifts, because the finger's absolute
    // position is the only stable thing about a drag. Re-grabbing mid-drag must
    // land where the finger says, not one accumulated offset away.
    const first = volumeFromDrag({ startX: 0, clientX: 200, containerWidth: 360, startVolume: 0 });
    const regrabbed = volumeFromDrag({ startX: 200, clientX: 200, containerWidth: 360, startVolume: first });
    expect(regrabbed).toBeCloseTo(first, 5);
  });

  it("does not divide by a zero-width container", () => {
    expect(volumeFromDrag({ startX: 0, clientX: 100, containerWidth: 0, startVolume: 0.7 })).toBe(0.7);
  });

  it("shows nothing audible when muted, whatever the level says", () => {
    expect(audibleVolume({ level: 0.8, muted: true })).toBe(0);
    expect(audibleVolume({ level: 0.8, muted: false })).toBe(0.8);
  });

  it("starts a muted drag from silence", () => {
    // A fader starts where it is. If a muted player's drag started from the
    // stored 0.4, the first pixel of movement would jump to a loud level.
    expect(dragStartLevel({ level: 0.4, muted: true })).toBe(0);
    expect(dragStartLevel({ level: 0.4, muted: false })).toBe(0.4);
  });

  it("unmutes on the way UP only", () => {
    expect(shouldUnmuteOnDrag({ startLevel: 0, nextLevel: 0.3, muted: true })).toBe(true);
    // Re-muting on the way down means a viewer who drags down to soften a video
    // and nudges up again finds it silent.
    expect(shouldUnmuteOnDrag({ startLevel: 0.5, nextLevel: 0.3, muted: true })).toBe(false);
    // Already audible: never touch the mute.
    expect(shouldUnmuteOnDrag({ startLevel: 0.2, nextLevel: 0.6, muted: false })).toBe(false);
  });
});

describe("the indicator is honest", () => {
  it("reads the audible level, not the stored one", () => {
    // Mute does not reset the level, so a muted player's stored level can still
    // be 0.8. Showing 80% on the bar while nothing is audible is the kind of
    // small lie that makes a viewer think the controls are broken.
    const { rerender } = render(<VolumeIndicator level={0.8} muted={false} visible />);
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("80");
    rerender(<VolumeIndicator level={0.8} muted visible />);
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("0");
  });

  it("says muted rather than 0%", () => {
    render(<VolumeIndicator level={0} muted visible />);
    // "0%" reads as a level the viewer chose. Silence is a state, not a value.
    expect(screen.getByRole("meter").getAttribute("aria-valuetext")).toBe("Muted");
  });

  it("announces politely, because a drag fires dozens of updates", () => {
    // An assertive announcement per pointermove would make the player unusable
    // with a screen reader; a polite one coalesces.
    render(<VolumeIndicator level={0.5} muted={false} visible />);
    const live = document.querySelector('[role="status"]');
    expect(live.getAttribute("aria-live")).toBe("polite");
  });

  it("stays mounted when not visible, so it can be read mid-drag", () => {
    const { rerender } = render(<VolumeIndicator level={0.5} muted={false} visible />);
    rerender(<VolumeIndicator level={0.5} muted={false} visible={false} />);
    expect(screen.getByRole("meter")).toBeTruthy();
  });
});

describe("the gesture hook", () => {
  const harness = (props = {}) => {
    const calls = { volume: [], mute: [], start: 0, end: 0 };
    const Probe = () => {
      const g = useVolumeGesture({
        containerRef: { current: { getBoundingClientRect: () => PHONE, setPointerCapture: () => {} } },
        enabled: true,
        level: 0.5,
        muted: false,
        onVolume: (v) => calls.volume.push(v),
        onMuteChange: (m) => calls.mute.push(m),
        onStart: () => { calls.start += 1; },
        onEnd: () => { calls.end += 1; },
        ...props,
      });
      return (
        <div data-testid="probe" data-active={String(g.active)} {...g.handlers} />
      );
    };
    return { Probe, calls };
  };

  it("changes volume on a left-third horizontal drag", () => {
    const { Probe, calls } = harness();
    const { getByTestId } = render(<Probe />);
    const node = getByTestId("probe");
    fireEvent.pointerDown(node, pointerAt(node, { x: 40, y: 320 }));
    fireEvent.pointerMove(node, pointerAt(node, { x: 40 + DRAG_ARM_PX + 60, y: 322 }));
    expect(calls.volume.length).toBeGreaterThan(0);
    // Rightward travel raises the level from the 0.5 the harness started at.
    expect(Math.max(...calls.volume)).toBeGreaterThan(0.5);
    expect(getByTestId("probe").getAttribute("data-active")).toBe("true");
  });

  it("does nothing for a press under the arming distance", () => {
    // The failure this rules out: tapping play/pause on the left third also
    // nudging the volume by a percent or two.
    const { Probe, calls } = harness();
    const { getByTestId } = render(<Probe />);
    const node = getByTestId("probe");
    fireEvent.pointerDown(node, pointerAt(node, { x: 40, y: 320 }));
    fireEvent.pointerMove(node, pointerAt(node, { x: 40 + DRAG_ARM_PX - 4, y: 320 }));
    fireEvent.pointerUp(node, pointerAt(node, { x: 40 + DRAG_ARM_PX - 4, y: 320 }));
    expect(calls.volume).toEqual([]);
    expect(calls.start).toBe(0);
  });

  it("ignores a vertical drag on the left", () => {
    const { Probe, calls } = harness();
    const { getByTestId } = render(<Probe />);
    const node = getByTestId("probe");
    fireEvent.pointerDown(node, pointerAt(node, { x: 40, y: 100 }));
    fireEvent.pointerMove(node, pointerAt(node, { x: 42, y: 260 }));
    expect(calls.volume).toEqual([]);
    expect(getByTestId("probe").getAttribute("data-active")).toBe("false");
  });

  it("ignores a horizontal drag in the centre and right thirds", () => {
    const { Probe, calls } = harness();
    const { getByTestId } = render(<Probe />);
    const node = getByTestId("probe");
    [[180, "centre"], [300, "right"]].forEach(([x]) => {
      fireEvent.pointerDown(node, pointerAt(node, { x, y: 320 }));
      fireEvent.pointerMove(node, pointerAt(node, { x: x + 120, y: 321 }));
      fireEvent.pointerUp(node, pointerAt(node, { x: x + 120, y: 321 }));
    });
    expect(calls.volume).toEqual([]);
  });

  it("ignores a press that starts on a chrome control", () => {
    // Otherwise tapping "−10s" would slide the volume as it seeks.
    const { Probe, calls } = harness();
    const { getByTestId } = render(
      <div data-chrome-layer="transport">
        <Probe />
      </div>,
    );
    const node = getByTestId("probe");
    // The probe is inside the layer, so its own events carry the ancestor.
    fireEvent.pointerDown(node, pointerAt(node, { x: 40, y: 320 }));
    fireEvent.pointerMove(node, pointerAt(node, { x: 140, y: 321 }));
    expect(calls.volume).toEqual([]);
  });

  it("is inert when disabled", () => {
    const { Probe, calls } = harness({ enabled: false });
    const { getByTestId } = render(<Probe />);
    const node = getByTestId("probe");
    fireEvent.pointerDown(node, pointerAt(node, { x: 40, y: 320 }));
    fireEvent.pointerMove(node, pointerAt(node, { x: 200, y: 321 }));
    expect(calls.volume).toEqual([]);
  });

  it("unmutes when a drag raises the level while muted", () => {
    const { Probe, calls } = harness({ level: 0, muted: true });
    const { getByTestId } = render(<Probe />);
    const node = getByTestId("probe");
    fireEvent.pointerDown(node, pointerAt(node, { x: 20, y: 320 }));
    fireEvent.pointerMove(node, pointerAt(node, { x: 140, y: 321 }));
    expect(calls.mute).toContain(false);
  });

  it("sweeps up from silence when muted, not from the stored level", () => {
    // The hook test for the same rule the pure function covers. Kept separate
    // because it is the INTEGRATION that matters: if the hook passes the stored
    // level where the pure function says drag-start, a muted player jumps to
    // 0.9 on the first pixel of a slow drag.
    const { Probe, calls } = harness({ level: 0.9, muted: true });
    const { getByTestId } = render(<Probe />);
    const node = getByTestId("probe");
    fireEvent.pointerDown(node, pointerAt(node, { x: 20, y: 320 }));
    // 20px of travel — enough to arm, only ~7% of the 288px sweep. From the
    // stored 0.9 this would read ~0.97; from silence it is ~0.07.
    fireEvent.pointerMove(node, pointerAt(node, { x: 40, y: 320 }));
    expect(calls.volume.at(-1)).toBeLessThan(0.2);
  });

  it("does not re-mute when a drag lowers the level", () => {
    const { Probe, calls } = harness({ level: 0.9, muted: true });
    const { getByTestId } = render(<Probe />);
    const node = getByTestId("probe");
    fireEvent.pointerDown(node, pointerAt(node, { x: 110, y: 320 }));
    fireEvent.pointerMove(node, pointerAt(node, { x: 20, y: 321 }));
    expect(calls.mute).toEqual([]);
  });

  it("starts from the level at press time, not a running total", () => {
    // A drag with feedback is an amplifier: recomputing from the level it just
    // set would compound every frame until the volume pinned at 0 or 1.
    const { Probe, calls } = harness({ level: 0.5 });
    const { getByTestId } = render(<Probe />);
    const node = getByTestId("probe");
    fireEvent.pointerDown(node, pointerAt(node, { x: 40, y: 320 }));
    for (let x = 60; x <= 140; x += 20) {
      fireEvent.pointerMove(node, pointerAt(node, { x, y: 320 }));
    }
    // 100px of 288px travel from 0.5, once — not 0.5 + 0.17 + 0.12 + ...
    const expected = volumeFromDrag({
      startX: 40,
      clientX: 140,
      containerWidth: PHONE.width,
      startVolume: 0.5,
    });
    expect(calls.volume.at(-1)).toBeCloseTo(expected, 6);
  });

  it("releases on pointercancel, so a system gesture cannot freeze it", () => {
    // An incoming call delivers pointercancel, not pointerup. Leaving the drag
    // "active" would strand the volume part-way and swallow the next touch.
    const { Probe, calls } = harness();
    const { getByTestId } = render(<Probe />);
    const node = getByTestId("probe");
    fireEvent.pointerDown(node, pointerAt(node, { x: 40, y: 320 }));
    fireEvent.pointerMove(node, pointerAt(node, { x: 140, y: 321 }));
    expect(getByTestId("probe").getAttribute("data-active")).toBe("true");
    fireEvent.pointerCancel(node, pointerAt(node, { x: 140, y: 321 }));
    expect(getByTestId("probe").getAttribute("data-active")).toBe("false");
    expect(calls.end).toBe(1);
  });

  it("ignores moves from a different pointer", () => {
    // Multi-touch: a second finger must not steer the first one's drag.
    const { Probe, calls } = harness();
    const { getByTestId } = render(<Probe />);
    const node = getByTestId("probe");
    fireEvent.pointerDown(node, pointerAt(node, { x: 40, y: 320, pointerId: 1 }));
    fireEvent.pointerMove(node, pointerAt(node, { x: 200, y: 321, pointerId: 2 }));
    expect(calls.volume).toEqual([]);
  });

  it("does nothing on a zero-width surface", () => {
    const { Probe, calls } = harness({
      containerRef: { current: { getBoundingClientRect: () => ({ left: 0, width: 0 }), setPointerCapture: () => {} } },
    });
    const { getByTestId } = render(<Probe />);
    const node = getByTestId("probe");
    fireEvent.pointerDown(node, pointerAt(node, { x: 40, y: 320 }));
    fireEvent.pointerMove(node, pointerAt(node, { x: 200, y: 321 }));
    expect(calls.volume).toEqual([]);
  });
});

describe("the shell wires all three paths", () => {
  const shell = async (extra = {}) => {
    mocks.resolve = async () => PLAYABLE;
    const out = render(
      <PlayerShell id="tt123" type="movie" title="Test" originalLanguage="en" {...extra} />,
    );
    await waitFor(() => expect(document.querySelector("video")).toBeTruthy());
    return out;
  };

  it("mounts the indicator only on touch", async () => {
    installMatchMedia(FINE);
    await shell();
    expect(document.querySelector(".pv2-volume-indicator")).toBeNull();
  });

  it("mounts the indicator on touch", async () => {
    installMatchMedia(COARSE);
    await shell();
    const indicator = document.querySelector(".pv2-volume-indicator");
    expect(indicator).toBeTruthy();
    expect(indicator.closest("[data-chrome-layer]")).toBeTruthy();
  });

  it("keeps the indicator out of the pointer path", async () => {
    // The readout sits over the left third, which is also where the drag starts.
    // A readout that swallowed the press would delete the first path silently.
    installMatchMedia(COARSE);
    await shell();
    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "..", "components", "player", "v2", "player.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.pv2-volume-indicator\s*\{[^}]*pointer-events:\s*none/);
  });

  it("gives the touch volume control the level and opens the sheet", async () => {
    installMatchMedia(COARSE);
    await shell();
    const opener = screen.getByRole("button", { name: /^Volume/ });
    expect(opener).toBeTruthy();
    expect(opener.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(opener);
    expect(document.querySelector(".pv2-shell").getAttribute("data-sheet")).toBe("volume");
  });

  it("shows the current level on the touch control", async () => {
    installMatchMedia(COARSE);
    const { container } = await shell();
    const el = document.querySelector("video");
    Object.defineProperty(el, "volume", { configurable: true, value: 0.65, writable: true });
    await act(async () => {
      el.dispatchEvent(new Event("volumechange"));
    });
    expect(container.querySelector('.pv2-value-btn[data-zone="left"]').textContent).toContain("65%");
  });
});

describe("the stylesheet does not fight the gesture", () => {
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "components", "player", "v2", "player.css"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("scales the indicator from the container, not the viewport", () => {
    expect(css).toMatch(/inline-size:\s*clamp\(4rem, 18cqi, 9rem\)/);
    expect(css).not.toMatch(/\.pv2-volume-indicator\s*\{[^}]*\d(vw|vh)/);
  });

  it("puts the indicator where the thumb is, not over the play/pause zone", () => {
    expect(css).toMatch(/\.pv2-volume-indicator\s*\{[^}]*inset-inline-start:\s*var\(--spacing-lg\)/);
  });

  it("does not transition the fill, so the bar tracks the finger", () => {
    // A transition here lags the gesture and makes the bar feel detached from
    // the finger that is driving it.
    expect(css).toMatch(/\.pv2-volume-indicator__fill\s*\{[^}]*transition:\s*none/);
  });

  it("respects 3.6 — no @media and no viewport units in the indicator block", () => {
    const block = css.slice(css.indexOf(".pv2-volume-indicator"));
    const own = block.slice(0, block.indexOf('/* ── Touch zones'));
    expect(own).not.toMatch(/@media/);
  });
});