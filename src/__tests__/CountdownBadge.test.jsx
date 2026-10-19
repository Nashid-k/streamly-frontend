// Under-a-day countdown regression: the copy must not read "In 0 days", and
// the badge must use the imminent (red, pulsing) style instead of the dull
// "released" grey that a floored 0-day diff used to select.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_t, tag) => {
        const Stub = ({ children, ...rest }) =>
          React.createElement(tag, { ...rest, "data-motion": tag }, children);
        Stub.displayName = `motion.${String(tag)}`;
        return Stub;
      },
    },
  ),
  // false so the pulse gate (animate && !reduceMotion) opens and the ring renders.
  useReducedMotion: () => false,
}));

vi.mock("lucide-react", () => ({
  Clock: (p) => React.createElement("span", { ...p, "data-icon": "clock" }),
  Zap: (p) => React.createElement("span", { ...p, "data-icon": "zap" }),
}));

import React from "react";
import CountdownBadge from "../components/CountdownBadge.jsx";

describe("CountdownBadge — under a day out", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 19h before the Prime (midnight-UTC) release instant of 2027-03-10.
    vi.setSystemTime(new Date("2027-03-09T05:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "In less than a day" with the imminent (pulsing) style', () => {
    const { container } = render(
      <CountdownBadge releaseDate="2027-03-10" platform="prime" compact />,
    );
    expect(container.textContent).toMatch(/less than a day/i);
    expect(container.textContent).not.toMatch(/in 0 days/i);
    // The pulse ring is CountdownBadge's imminent signature; the released/future
    // styles never render it.
    expect(container.querySelector(".countdown-badge-ring")).not.toBeNull();
  });
});
