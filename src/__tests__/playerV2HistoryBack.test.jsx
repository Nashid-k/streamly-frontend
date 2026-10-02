import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useHistoryBack, { BACK_STATE_KEY } from "../components/player/v2/hooks/useHistoryBack";

/* task.md 3.38 — Back closes the player instead of leaving the page.
 *
 * The hook is small but the edge that matters is the CLEANUP: a player closed by
 * its own button must peel the entry it pushed, while a player closed BY Back
 * must not peel again and skip a page the viewer never asked to leave.
 */

let backSpy;

beforeEach(() => {
  // Each test starts from a clean current-entry state.
  window.history.replaceState(null, "");
  // jsdom's traversal is not what these assertions are about; the calls are.
  backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
});

afterEach(() => {
  backSpy.mockRestore();
  vi.restoreAllMocks();
});

describe("useHistoryBack", () => {
  it("pushes exactly one marked entry when it opens", () => {
    const push = vi.spyOn(window.history, "pushState");
    const { unmount } = renderHook(() => useHistoryBack({ onBack: () => {} }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatchObject({ [BACK_STATE_KEY]: true });
    unmount();
  });

  it("calls onBack when the browser goes Back (popstate)", () => {
    const onBack = vi.fn();
    const { unmount } = renderHook(() => useHistoryBack({ onBack }));

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("peels its own entry when the app closes it", () => {
    const { unmount } = renderHook(() => useHistoryBack({ onBack: () => {} }));
    expect(window.history.state?.[BACK_STATE_KEY]).toBe(true);

    unmount();

    // Closed by the player's own UI: the pushed entry has to go, or the viewer is
    // left needing two Backs to leave the page.
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it("does not step back again after a Back-close", () => {
    const onBack = vi.fn();
    const { unmount } = renderHook(() => useHistoryBack({ onBack }));

    act(() => {
      // The browser has already moved to the previous entry by the time popstate
      // fires; model that, then deliver the event.
      window.history.replaceState(null, "");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(onBack).toHaveBeenCalledTimes(1);

    unmount();

    // Stepping back here would skip a page the viewer never chose to leave.
    expect(backSpy).not.toHaveBeenCalled();
  });

  it("does not push again when only the callback identity changes", () => {
    const push = vi.spyOn(window.history, "pushState");
    const { rerender, unmount } = renderHook(({ cb }) => useHistoryBack({ onBack: cb }), {
      initialProps: { cb: () => {} },
    });

    rerender({ cb: () => {} });
    rerender({ cb: () => {} });

    // PlayerShell passes an inline `() => setOpen(false)`, so a hook that depended
    // on it directly would push a history entry on every render of the shell.
    expect(push).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("touches history not at all when disabled", () => {
    const push = vi.spyOn(window.history, "pushState");
    const { unmount } = renderHook(() => useHistoryBack({ enabled: false, onBack: () => {} }));

    expect(push).not.toHaveBeenCalled();
    unmount();
    expect(backSpy).not.toHaveBeenCalled();
  });

  it("removes its listener on close, so a later Back cannot re-fire onBack", () => {
    const onBack = vi.fn();
    const { unmount } = renderHook(() => useHistoryBack({ onBack }));
    unmount();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(onBack).not.toHaveBeenCalled();
  });
});
