import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { stubMediaElement } from "../test/mediaHarness";

/* "Seek Time" in Settings offered 5 / 10 / 15 / 30 seconds and did NOTHING:
   the player hardcoded `const SKIP_SECONDS = 10`, so every skip — the
   transport buttons, the arrow keys, the touch double-tap and the
   media-session handlers — jumped 10 seconds no matter what the viewer
   picked. A setting that changes nothing is worse than a missing one: it
   teaches the viewer that the app ignores them.

   The skip amount is now read from the preference, and the transport labels
   name the amount they actually apply ("Rewind 10 seconds" used to be
   hardcoded too, so a 30-second jump came from a button labelled 10). */

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
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

afterAll(() => {
  vi.resetModules();
});

/* The player and the provider are imported TOGETHER, in the same tick, on
   purpose: the player reads the preference through the context object, and a
   `vi.resetModules()` between the two imports would hand them two different
   context instances — the player would then see no provider at all and fall
   back to the default, which is exactly the bug this file exists to catch. */
const mountWithSeekTime = async (seconds) => {
  if (seconds !== undefined) {
    localStorage.setItem("setting-seekTime", JSON.stringify(seconds));
  }
  const [playerMod, prefsMod] = await Promise.all([
    import("../components/NativePlayerView"),
    import("../context/PreferencesContext"),
  ]);
  return render(
    <prefsMod.PreferencesProvider>
      <playerMod.default type="movie" id="550" title="Fight Club" onClose={() => {}} />
    </prefsMod.PreferencesProvider>,
  );
};

const skipButtons = (container) => ({
  back: container.querySelector('button[aria-label^="Rewind"]'),
  forward: container.querySelector('button[aria-label^="Forward"]'),
});

describe("Seek Time preference", { timeout: MOUNT_BUDGET_MS }, () => {
  it("seeks by the amount the viewer chose, not a hardcoded 10", async () => {
    const { container } = await mountWithSeekTime(30);
    const v = stubMediaElement(container);
    const { back, forward } = skipButtons(container);
    const from = v.currentTime;

    fireEvent.click(forward);
    expect(v.currentTime).toBe(from + 30);

    fireEvent.click(back);
    expect(v.currentTime).toBe(from);
  });

  it("honours a 5 second setting too", async () => {
    const { container } = await mountWithSeekTime(5);
    const v = stubMediaElement(container);
    const { forward } = skipButtons(container);
    const from = v.currentTime;

    fireEvent.click(forward);
    expect(v.currentTime).toBe(from + 5);
  });

  it("labels the transport buttons with the amount they actually apply", async () => {
    const { container } = await mountWithSeekTime(30);
    const { back, forward } = skipButtons(container);

    // The label used to be a hardcoded "10 seconds".
    expect(back?.getAttribute("aria-label")).toBe("Rewind 30 seconds");
    expect(forward?.getAttribute("aria-label")).toBe("Forward 30 seconds");
  });

  it("falls back to 10 seconds when the viewer never chose one", async () => {
    const { container } = await mountWithSeekTime(undefined);
    const v = stubMediaElement(container);
    const { forward } = skipButtons(container);
    const from = v.currentTime;

    fireEvent.click(forward);
    expect(v.currentTime).toBe(from + 10);
  });
});
