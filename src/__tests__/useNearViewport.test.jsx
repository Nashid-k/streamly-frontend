import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useNearViewport } from "@/hooks/useNearViewport";

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
    if (originalIntersectionObserver === undefined) delete window.IntersectionObserver;
    else window.IntersectionObserver = originalIntersectionObserver;
  });

  it("treats a browser without IntersectionObserver as visible (never blocks fetching)", () => {
    delete window.IntersectionObserver;

    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("near");
  });

  it("shares one observer across same-margin sentinels and tracks each sentinel independently", () => {
    let observerCallback;
    let observerOptions;
    const observed = [];
    const unobserveMock = vi.fn();

    window.IntersectionObserver = vi.fn(function (callback, options) {
      observerCallback = callback;
      observerOptions = options;
      this.observe = (node) => observed.push(node);
      this.unobserve = unobserveMock;
    });

    const { unmount } = render(
      <>
        <Probe />
        <Probe />
        <Probe />
      </>,
    );

    expect(window.IntersectionObserver).toHaveBeenCalledTimes(1);
    expect(observerOptions.rootMargin).toBe("600px 0px");
    expect(observed).toHaveLength(3);
    expect(screen.getAllByTestId("probe").map((node) => node.textContent)).toEqual([
      "far",
      "far",
      "far",
    ]);

    act(() => observerCallback([{ target: observed[0], isIntersecting: true }]));
    expect(screen.getAllByTestId("probe").map((node) => node.textContent)).toEqual([
      "near",
      "far",
      "far",
    ]);

    // Once a rail enters its prefetch margin, it remains enabled and is
    // unobserved. Leaving the margin must not disable a query mid-flight.
    act(() => observerCallback([{ target: observed[0], isIntersecting: false }]));
    expect(screen.getAllByTestId("probe").map((node) => node.textContent)).toEqual([
      "near",
      "far",
      "far",
    ]);
    expect(unobserveMock).toHaveBeenCalledTimes(1);

    unmount();
    expect(unobserveMock).toHaveBeenCalledTimes(3);
  });
});
