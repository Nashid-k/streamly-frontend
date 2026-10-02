import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContinueWatching, flushUserDataWrites } from "../hooks/useUserData";

/* Continue-watching persistence (task.md 5.17).
 *
 * `updateProgress` runs about once a second during playback. It used to do a
 * synchronous JSON.stringify + localStorage.setItem + window event on every
 * call — on the main thread while the video decodes. The write is now
 * coalesced and drained in one idle window, while the React state (what the UI
 * reads) still updates synchronously.
 */

const movie = { id: "movie-1", title: "Heat" };

function stored() {
  const raw = localStorage.getItem("aios_continue_watching");
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  // Drain any timer left pending by the test so the module-level scheduler
  // does not carry a stale handle into the next one.
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useContinueWatching progress write (task.md 5.17)", () => {
  it("updates the UI immediately but defers the localStorage write", () => {
    const { result } = renderHook(() => useContinueWatching());

    act(() => result.current.updateProgress(movie, 1, 2, 42));

    expect(result.current.continueWatching[0].timestamp).toBe(42);
    expect(stored()).toBeNull();
  });

  it("drains the deferred write on the idle window", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const { result } = renderHook(() => useContinueWatching());

    act(() => result.current.updateProgress(movie, 1, 2, 42));
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(stored()[0].timestamp).toBe(42);
    expect(setItem).toHaveBeenCalledWith("aios_continue_watching", expect.any(String));
    expect(dispatch.mock.calls.some(([event]) => event.type === "aios_sync_cw")).toBe(true);
  });

  it("coalesces a burst of saves into a single write of the last value", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useContinueWatching());

    act(() => {
      result.current.updateProgress(movie, 1, 2, 10);
      result.current.updateProgress(movie, 1, 2, 20);
      result.current.updateProgress(movie, 1, 2, 30);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    const cwWrites = setItem.mock.calls.filter(([key]) => key === "aios_continue_watching");
    expect(cwWrites).toHaveLength(1);
    expect(stored()[0].timestamp).toBe(30);
  });

  it("flushes a pending write when the document is hidden", () => {
    const { result } = renderHook(() => useContinueWatching());

    act(() => result.current.updateProgress(movie, 1, 2, 77));
    expect(stored()).toBeNull();

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(stored()[0].timestamp).toBe(77);
  });

  it("flushUserDataWrites drains at once for the cloud-sync reader", () => {
    const { result } = renderHook(() => useContinueWatching());

    act(() => result.current.updateProgress(movie, 1, 2, 55));
    expect(stored()).toBeNull();

    act(() => flushUserDataWrites());

    expect(stored()[0].timestamp).toBe(55);
  });
});
