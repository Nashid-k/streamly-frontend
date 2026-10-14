import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import OfflineBanner from "../components/OfflineBanner";

const setOnLine = (value) => {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
};

afterEach(() => {
  setOnLine(true);
});

describe("OfflineBanner", () => {
  it("renders nothing when the browser is online", () => {
    setOnLine(true);
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the offline notice when navigator.onLine is false", () => {
    setOnLine(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it("hides the notice once the browser comes back online", () => {
    setOnLine(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
