// The desktop transport bar's ±10s buttons and the hold-to-2x they own.
//
// These four props (onBack10 / onForward10 / onForwardHoldStart /
// onForwardHoldRelease) were passed by the engine and destructured by
// BottomChrome, but the chrome never rendered a control that used them — so on
// DESKTOP there was no rewind/forward button at all, and because the only
// callers of the desktop hold path lived on those buttons, `desktopHoldTimerRef`
// and the `desktopHoldFiredRef` guard were unreachable: hold-to-2x only ever
// worked via touch and the Space key. Nothing caught it because no test ever
// queried a transport control by name.
//
// Desktop is "no coarse pointer", so unlike the touch suite this file does NOT
// stub matchMedia — the real module sees hover/fine and renders the desktop bar.
//
// jsdom's media element is inert, so it is stubbed after mount the same way the
// touch suite does it.
import { describe, expect, it, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";

/* Mounting the full player cold can exceed vitest's 5s default under parallel
   load; the assertions are instant, the budget is for the component. */
const MOUNT_BUDGET_MS = 30_000;

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  vi.useFakeTimers({ now: 1_800_000_000_000 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

afterAll(() => {
  vi.resetModules();
});

const mount = async () => {
  const mod = await import("../components/NativePlayerView");
  return render(
    <mod.default type="movie" id="550" title="Fight Club" onClose={() => {}} />,
  );
};

/* Strip the inert jsdom media element down to the handful of surfaces the
   transport touches: a live clock, a rate, and a seeking flag. */
const stubMedia = (container) => {
  const v = container.querySelector("video");
  let paused = false;
  Object.defineProperty(v, "paused", {
    get: () => paused,
    set: (next) => {
      paused = next;
    },
    configurable: true,
  });
  let rate = 1;
  Object.defineProperty(v, "playbackRate", {
    get: () => rate,
    set: (next) => {
      rate = next;
    },
    configurable: true,
  });
  let seeking = false;
  Object.defineProperty(v, "seeking", {
    get: () => seeking,
    set: (next) => {
      seeking = next;
    },
    configurable: true,
  });
  let current = 120;
  Object.defineProperty(v, "currentTime", {
    get: () => current,
    set: (next) => {
      current = next;
      seeking = false;
    },
    configurable: true,
  });
  Object.defineProperty(v, "duration", {
    get: () => 3600,
    set: () => {},
    configurable: true,
  });
  v.play = vi.fn().mockResolvedValue(undefined);
  v.pause = vi.fn().mockImplementation(() => {
    paused = true;
  });
  // The bar is only interactive once the picture is live (buffering gates it).
  act(() => {
    v.dispatchEvent(new Event("canplay"));
  });
  return v;
};

const advance = (ms) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const buttons = (container) => ({
  back: container.querySelector('button[aria-label="Rewind 10 seconds"]'),
  forward: container.querySelector('button[aria-label="Forward 10 seconds"]'),
});

describe("desktop transport ±10s", { timeout: MOUNT_BUDGET_MS }, () => {
  it("renders both skip buttons (they were missing entirely)", async () => {
    const { container } = await mount();
    const { back, forward } = buttons(container);
    expect(back).not.toBeNull();
    expect(forward).not.toBeNull();
  });

  it("seeks forward and back by 10 seconds on a plain click", async () => {
    const { container } = await mount();
    const v = stubMedia(container);
    const { back, forward } = buttons(container);
    const from = v.currentTime;

    fireEvent.click(forward);
    expect(v.currentTime).toBe(from + 10);

    fireEvent.click(back);
    expect(v.currentTime).toBe(from);
  });
});

describe("desktop hold-to-2x", { timeout: MOUNT_BUDGET_MS }, () => {
  /* The forward button reports press/release; the ENGINE arms the 2x after
     HOLD_2X_DELAY_MS and restores it on release. This is the path the dead
     wiring made unreachable. */
  const pressForward = (forward) => fireEvent.pointerDown(forward, { pointerId: 1, button: 0 });
  const releaseForward = (forward) => fireEvent.pointerUp(forward, { pointerId: 1, button: 0 });

  it("arms 2x on a sustained press and restores the rate on release", async () => {
    const { container } = await mount();
    const v = stubMedia(container);
    const { forward } = buttons(container);

    pressForward(forward);
    advance(500);
    expect(v.playbackRate).toBe(2);

    releaseForward(forward);
    expect(v.playbackRate).toBe(1);
  });

  it("does not arm 2x on a quick press (it is a seek)", async () => {
    const { container } = await mount();
    const v = stubMedia(container);
    const { forward } = buttons(container);

    pressForward(forward);
    advance(100); // well under the arm delay
    releaseForward(forward);
    expect(v.playbackRate).toBe(1);
  });

  it("does not ALSO seek when the click follows a fired hold", async () => {
    const { container } = await mount();
    const v = stubMedia(container);
    const { forward } = buttons(container);
    const from = v.currentTime;

    pressForward(forward);
    advance(500); // hold fires: 2x + desktopHoldFiredRef set
    fireEvent.click(forward); // browsers deliver the click after the release
    expect(v.currentTime).toBe(from); // the seek is suppressed

    releaseForward(forward);
  });
});
