// Render guard for the red "NEW" card tag.
//
// Two things the pure logic tests in contentTags.test.js cannot check:
//  1. the tag is actually RED on screen (a tone regression would ship silently),
//  2. it is visually distinguishable from CountdownBadge's red — that one
//     PULSES and means "not out yet", this one is static and means "just out".
//     If these two ever look alike, a viewer cannot tell "coming soon" from
//     "just released", so this asserts the two states stay separated.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_t, tag) => {
        // Every motion.<tag> renders as that tag. Props are spread (NOT picked)
        // so assertions on title/style survive the mock.
        const Stub = ({ children, ...rest }) =>
          React.createElement(tag, { ...rest, "data-motion": tag }, children);
        Stub.displayName = `motion.${String(tag)}`;
        return Stub;
      },
    },
  ),
  // false, so CountdownBadge's pulse gate (animate && !reduceMotion) opens and
  // the ring renders. ContentTag never renders that ring regardless, so this
  // does not weaken its own "no pulse" assertion.
  useReducedMotion: () => false,
}));

vi.mock("lucide-react", () => ({
  Clock: (p) => React.createElement("span", { ...p, "data-icon": "clock" }),
  Zap: (p) => React.createElement("span", { ...p, "data-icon": "zap" }),
}));

import React from "react";
import ContentTag from "../components/ContentTag.jsx";
import CountdownBadge from "../components/CountdownBadge.jsx";
import { getContentTags } from "../utils/contentTags.js";

const NOW = Date.parse("2026-06-15T09:30:00Z");
const day = (offset) => new Date(NOW + offset * 86400000).toISOString().slice(0, 10);

describe("ContentTag", () => {
  it("renders the label and the checkable reason as a tooltip", () => {
    render(<ContentTag label="NEW" tone="new" reason="Released today" />);
    const el = screen.getByText("NEW");
    expect(el).toBeTruthy();
    expect(el.getAttribute("title")).toBe("Released today");
  });

  it("is actually red — solid #ef4444→#dc2626 fill, not the green accent", () => {
    render(<ContentTag label="NEW" tone="new" />);
    const style = screen.getByText("NEW").getAttribute("style") || "";
    // jsdom normalises inline hex to rgb(), so assert the rgb form of
    // #ef4444 → #dc2626. Both stops must be present, or the fill is not red.
    expect(style).toContain("rgb(239, 68, 68)");
    expect(style).toContain("rgb(220, 38, 38)");
    // The old badge used var(--accent-gradient), i.e. green. Guard the fix.
    expect(style).not.toContain("accent-gradient");
  });

  it("does not pulse — pulsing is CountdownBadge's signature", () => {
    const { container } = render(<ContentTag label="NEW" tone="new" />);
    // The pulse implementation is a ring element; it must be absent here.
    expect(container.querySelector(".countdown-badge-ring")).toBeNull();
  });
});

describe("NEW tag vs CountdownBadge — the two reds must stay distinguishable", () => {
  // CountdownBadge calls `new Date()` internally, so these tests freeze the
  // clock instead of guessing offsets. Guessing is what made them flaky: a
  // release at T00:00:00Z is 0.4 or 1.9 days out depending on when CI runs,
  // which flips the urgency bucket and the label.
  const FROZEN = "2026-06-15T12:00:00Z";

  it("a released title gets NEW, an unreleased one does not", () => {
    const released = { id: "movie-1", isSeries: false, releaseDate: day(-1) };
    const upcoming = { id: "movie-2", isSeries: false, releaseDate: day(2) };

    expect(getContentTags(released, { now: NOW })).toHaveLength(1);
    expect(getContentTags(upcoming, { now: NOW })).toHaveLength(0);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FROZEN));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // getCountdown floors whole days from midnight-UTC, so with the clock frozen
  // at 2026-06-15T12:00Z: 17th → 1.5d → days=1 (imminent, red pulse),
  // 18th → 2.5d → days=2 ("In 2 days", orange).
  it("the countdown renders an unreleased title, proving it owns that state", () => {
    const { container } = render(<CountdownBadge releaseDate="2026-06-18" compact />);
    expect(container.textContent).toMatch(/in 2 days/i);
  });

  it("the countdown keeps its pulse ring so it stays visually distinct", () => {
    // 1 day out = imminent = the red-pulse state NEW must never look like.
    const { container } = render(<CountdownBadge releaseDate="2026-06-17" compact />);
    expect(container.querySelector(".countdown-badge-ring")).not.toBeNull();
  });

  it("a title released today gets the countdown suppressed, freeing NEW to own it", () => {
    const { container } = render(<CountdownBadge releaseDate="2026-06-15" compact />);
    expect(container.firstChild).toBeNull();
    // …and the NEW rule agrees that nothing is pending.
    expect(getContentTags({ id: "m", isSeries: false, releaseDate: "2026-06-15" }, { now: Date.parse(FROZEN) })).toHaveLength(1);
  });
});
