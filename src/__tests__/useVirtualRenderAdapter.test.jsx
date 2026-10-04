import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVirtualRenderAdapter } from "@/hooks/useVirtualRenderAdapter";

// Off-screen stand-in: jsdom reports a 0x0 rect at 0,0 for everything, which
// the hook's in-viewport fast path would treat as visible.
function makeOffscreenElement() {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({
    top: 5000,
    bottom: 5200,
    left: 0,
    right: 0,
    width: 0,
    height: 200,
  });
  return el;
}

describe("useVirtualRenderAdapter", () => {
  let originalIntersectionObserver;

  beforeEach(() => {
    originalIntersectionObserver = window.IntersectionObserver;
  });

  afterEach(() => {
    window.IntersectionObserver = originalIntersectionObserver;
  });

  it("fails gracefully and marks visible immediately if IntersectionObserver is unsupported", () => {
    delete window.IntersectionObserver;

    const { result } = renderHook(() => useVirtualRenderAdapter());
    expect(result.current.isVisible).toBe(true);
    expect(result.current.ref).toBeDefined();
  });

  it("starts invisible and observes while off-screen, then reveals on intersection", () => {
    let observerCallback;
    const observeMock = vi.fn();
    const unobserveMock = vi.fn();

    window.IntersectionObserver = vi.fn(function (callback) {
      observerCallback = callback;
      this.observe = observeMock;
      this.unobserve = unobserveMock;
    });

    const { result } = renderHook(() => useVirtualRenderAdapter("300px"));
    expect(result.current.isVisible).toBe(false);

    const element = makeOffscreenElement();
    act(() => {
      result.current.ref(element);
    });

    expect(result.current.isVisible).toBe(false);
    expect(observeMock).toHaveBeenCalledWith(element);

    act(() => {
      observerCallback([{ isIntersecting: true, target: element }]);
    });

    expect(result.current.isVisible).toBe(true);
    // Stops tracking once revealed instead of holding the observer.
    expect(unobserveMock).toHaveBeenCalledWith(element);
  });

  it("reveals immediately, without waiting for the observer, when already in view", () => {
    const observeMock = vi.fn();

    window.IntersectionObserver = vi.fn(function () {
      this.observe = observeMock;
      this.unobserve = vi.fn();
    });

    const { result } = renderHook(() => useVirtualRenderAdapter("300px"));

    act(() => {
      result.current.ref(document.createElement("div"));
    });

    expect(result.current.isVisible).toBe(true);
    expect(observeMock).not.toHaveBeenCalled();
  });

  it("shares a single observer between hooks using the same rootMargin", () => {
    const instanceSpy = vi.fn(function () {
      this.observe = vi.fn();
      this.unobserve = vi.fn();
    });
    window.IntersectionObserver = instanceSpy;

    const first = renderHook(() => useVirtualRenderAdapter("400px"));
    const second = renderHook(() => useVirtualRenderAdapter("400px"));

    act(() => {
      first.result.current.ref(makeOffscreenElement());
      second.result.current.ref(makeOffscreenElement());
    });

    expect(instanceSpy).toHaveBeenCalledTimes(1);
  });
});
