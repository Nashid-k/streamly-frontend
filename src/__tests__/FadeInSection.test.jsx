import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import FadeInSection from "../components/rails/FadeInSection";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FadeInSection", () => {
  it("shares one observer across every section using the same reveal margin", () => {
    const observed = [];
    let notify;
    const unobserve = vi.fn();
    const Observer = vi.fn(function (callback) {
      notify = callback;
      this.observe = (node) => observed.push(node);
      this.unobserve = unobserve;
    });
    window.IntersectionObserver = Observer;

    render(
      <>
        <FadeInSection>First rail</FadeInSection>
        <FadeInSection>Second rail</FadeInSection>
        <FadeInSection>Third rail</FadeInSection>
      </>,
    );

    expect(Observer).toHaveBeenCalledTimes(1);
    expect(observed).toHaveLength(3);
    expect(screen.getByText("First rail").parentElement).not.toHaveClass("is-visible");

    act(() => {
      notify(observed.map((target) => ({ target, isIntersecting: true })));
    });

    for (const label of ["First rail", "Second rail", "Third rail"]) {
      expect(screen.getByText(label).parentElement).toHaveClass("is-visible");
    }
    expect(unobserve).toHaveBeenCalledTimes(3);
  });

  it("shows content immediately when IntersectionObserver is unavailable", () => {
    delete window.IntersectionObserver;

    render(<FadeInSection>Accessible fallback</FadeInSection>);

    expect(screen.getByText("Accessible fallback").parentElement).toHaveClass("is-visible");
  });
});
