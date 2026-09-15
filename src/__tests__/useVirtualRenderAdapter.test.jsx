import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVirtualRenderAdapter } from "@/hooks/useVirtualRenderAdapter";

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

  it("starts invisible and attaches observer when IntersectionObserver is supported", () => {
    let observerCallback;
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();
    const unobserveMock = vi.fn();

    window.IntersectionObserver = vi.fn(function (callback) {
      observerCallback = callback;
      this.observe = observeMock;
      this.disconnect = disconnectMock;
      this.unobserve = unobserveMock;
    });

    const { result } = renderHook(() => useVirtualRenderAdapter("300px"));
    expect(result.current.isVisible).toBe(false);

    // Attach dummy element to ref
    const dummyElement = document.createElement("div");
    result.current.ref.current = dummyElement;

    // Trigger intersection
    act(() => {
      observerCallback([{ isIntersecting: true }]);
    });

    expect(result.current.isVisible).toBe(true);
    expect(disconnectMock).toHaveBeenCalled();
  });
});
