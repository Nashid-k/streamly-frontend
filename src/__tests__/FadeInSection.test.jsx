import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import FadeInSection from "../components/rails/FadeInSection";

let originalIntersectionObserver;

beforeEach(() => {
  originalIntersectionObserver = window.IntersectionObserver;
});

afterEach(() => {
  cleanup();
  if (originalIntersectionObserver === undefined) delete window.IntersectionObserver;
  else window.IntersectionObserver = originalIntersectionObserver;
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

    const section = (label) => screen.getByText(label).closest(".fade-in-section");

    expect(Observer).toHaveBeenCalledTimes(1);
    expect(observed).toHaveLength(3);
    expect(section("First rail")).not.toHaveClass("is-visible");

    act(() => {
      notify(observed.map((target) => ({ target, isIntersecting: true })));
    });

    for (const label of ["First rail", "Second rail", "Third rail"]) {
      expect(section(label)).toHaveClass("is-visible");
    }
    expect(unobserve).toHaveBeenCalledTimes(3);
  });

  it("shows content immediately when IntersectionObserver is unavailable", () => {
    delete window.IntersectionObserver;

    render(<FadeInSection>Accessible fallback</FadeInSection>);

    expect(screen.getByText("Accessible fallback").closest(".fade-in-section")).toHaveClass(
      "is-visible",
    );
  });
});
