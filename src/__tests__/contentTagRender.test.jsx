// Render guard for the card status badges.
//
// Two things the pure logic tests in contentTags.test.js cannot check:
//  1. NEW is the SOLID theme-accent pill and the countdowns are GLASS — the
//     form, not the hue, is what keeps "just released" readable apart from
//     "out imminently" (a red-accent theme makes both red).
//  2. only CountdownBadge carries the pulse ring.
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

  it("is the SOLID theme-accent pill, never the glass urgency tone", () => {
    render(<ContentTag label="NEW" tone="new" />);
    const el = screen.getByText("NEW");
    // The fill/ink now come from --accent-color/--on-accent in CSS, so the
    // contract is the class (which re-tints with the theme), not an rgb value.
    expect(el.className).toContain("content-badge");
    expect(el.className).toContain("content-badge--solid");
    expect(el.className).not.toContain("content-badge--imminent");
    expect(el.className).not.toContain("content-badge--soon");
    // The old inline gradient would defeat every theme; it must stay gone.
    expect(el.getAttribute("style") || "").not.toContain("gradient");
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
  // release is 0.4 or 1.9 day-gaps out depending on when CI runs, which flips
  // the urgency bucket and the label.
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

  // getCountdown anchors at the platform release instant (default: 20:00 ET,
  // so it agrees with a converted local date instead of a UTC-midnight string).
  // With the clock frozen at 2026-06-15T12:00Z: 16th → 1.5d → days=1
  // (imminent, red pulse), 18th → 3.5d → days=3 ("In 3 days", orange).
  it("the countdown renders an unreleased title, proving it owns that state", () => {
    const { container } = render(<CountdownBadge releaseDate="2026-06-18" compact />);
    expect(container.textContent).toMatch(/in 3 days/i);
  });

  it("ramps the glass ink by distance: amber this week, violet for weeks", () => {
    const soon = render(<CountdownBadge releaseDate="2026-06-18" compact />);
    const soonPill = soon.container.querySelector(".content-badge");
    expect(soonPill.className).toContain("content-badge--soon");
    expect(soon.container.querySelector(".countdown-badge-ring")).toBeNull();

    const weeks = render(<CountdownBadge releaseDate="2026-07-05" compact />);
    expect(weeks.container.textContent).toMatch(/in 3 weeks/i);
    expect(weeks.container.querySelector(".content-badge").className).toContain(
      "content-badge--weeks",
    );
  });

  it("the countdown keeps its pulse ring so it stays visually distinct", () => {
    // 1 day out = imminent = the red-pulse state NEW must never look like.
    const { container } = render(<CountdownBadge releaseDate="2026-06-16" compact />);
    expect(container.querySelector(".countdown-badge-ring")).not.toBeNull();
    const pill = container.querySelector(".content-badge");
    expect(pill.className).toContain("content-badge--imminent");
    // Glass, never the solid accent form NEW owns.
    expect(pill.className).not.toContain("content-badge--solid");
  });

  it("a title released today gets the countdown suppressed, freeing NEW to own it", () => {
    const { container } = render(<CountdownBadge releaseDate="2026-06-14" compact />);
    expect(container.firstChild).toBeNull();
    // …and the NEW rule agrees that nothing is pending.
    expect(getContentTags({ id: "m", isSeries: false, releaseDate: "2026-06-14" }, { now: Date.parse(FROZEN) })).toHaveLength(1);
  });
});
