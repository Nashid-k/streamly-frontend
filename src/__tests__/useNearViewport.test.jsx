import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useNearViewport } from "@/hooks/useNearViewport";

/* Real mount (not renderHook) because the hook only observes an element the
   ref has actually been attached to — which is the behaviour under test. */
function Probe() {
  const [ref, inView] = useNearViewport("600px 0px");
  return <div ref={ref} data-testid="probe">{inView ? "near" : "far"}</div>;
}

describe("useNearViewport", () => {
  let originalIntersectionObserver;

  beforeEach(() => {
    originalIntersectionObserver = window.IntersectionObserver;
  });

  afterEach(() => {
    window.IntersectionObserver = originalIntersectionObserver;
  });

  it("treats a browser without IntersectionObserver as visible (never blocks fetching)", () => {
    delete window.IntersectionObserver;

    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("near");
  });

  it("stays hidden until the element intersects, then follows it in and out", () => {
    let observerCallback;
    let observerOptions;
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();

    window.IntersectionObserver = vi.fn(function (callback, options) {
      observerCallback = callback;
      observerOptions = options;
      this.observe = observeMock;
      this.disconnect = disconnectMock;
    });

    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("far");
    expect(observerOptions.rootMargin).toBe("600px 0px");
    expect(observeMock).toHaveBeenCalledWith(screen.getByTestId("probe"));

    act(() => observerCallback([{ isIntersecting: true }]));
    expect(screen.getByTestId("probe")).toHaveTextContent("near");

    act(() => observerCallback([{ isIntersecting: false }]));
    expect(screen.getByTestId("probe")).toHaveTextContent("far");
  });

  it("disconnects the observer on unmount", () => {
    const disconnectMock = vi.fn();
    window.IntersectionObserver = vi.fn(function () {
      this.observe = vi.fn();
      this.disconnect = disconnectMock;
    });

    const { unmount } = render(<Probe />);
    unmount();
    expect(disconnectMock).toHaveBeenCalled();
  });
});
