// The "NEW" card tag means RECENTLY RELEASED, not "recently added to the
// catalogue" — TMDB gives us no addedAt field, so the honest derivable signal
// is the release date. These tests pin the window, and pin the cases where the
// tag must NOT appear, because a tag that lies is worse than no tag.
import { describe, expect, it } from "vitest";
import {
  getContentTags,
  daysSinceRelease,
  NEW_TAG_WINDOW_DAYS,
} from "../utils/contentTags.js";

// A fixed clock keeps "today" deterministic — a test that passes only on the
// day it was written is worse than no test.
const NOW = Date.parse("2026-06-15T09:30:00Z");
const day = (offset) => new Date(NOW + offset * 86400000).toISOString().slice(0, 10);

describe("daysSinceRelease", () => {
  it("returns 0 for today and positive for past days", () => {
    expect(daysSinceRelease(day(0), NOW)).toBe(0);
    expect(daysSinceRelease(day(-1), NOW)).toBe(1);
    expect(daysSinceRelease(day(-30), NOW)).toBe(30);
  });

  it("returns null for missing or malformed dates instead of guessing", () => {
    expect(daysSinceRelease(null, NOW)).toBeNull();
    expect(daysSinceRelease(undefined, NOW)).toBeNull();
    expect(daysSinceRelease("", NOW)).toBeNull();
    expect(daysSinceRelease("not-a-date", NOW)).toBeNull();
    expect(daysSinceRelease("2026", NOW)).toBeNull();
  });

  it("tolerates a full ISO timestamp by reading only the date part", () => {
    expect(daysSinceRelease(`${day(0)}T23:59:59Z`, NOW)).toBe(0);
    expect(daysSinceRelease(`${day(-2)}T00:00:00Z`, NOW)).toBe(2);
  });
});

describe("getContentTags — the NEW window", () => {
  const movie = (releaseDate) => ({ id: "movie-1", isSeries: false, releaseDate });

  it("tags a title released today", () => {
    const tags = getContentTags(movie(day(0)), { now: NOW });
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ id: "new", label: "NEW", tone: "new", days: 0 });
  });

  it("tags a title released yesterday", () => {
    expect(getContentTags(movie(day(-1)), { now: NOW })[0]).toMatchObject({ days: 1 });
  });

  it("tags inside the window and stops exactly at the boundary", () => {
    expect(getContentTags(movie(day(-NEW_TAG_WINDOW_DAYS)), { now: NOW })).toHaveLength(1);
    expect(getContentTags(movie(day(-(NEW_TAG_WINDOW_DAYS + 1))), { now: NOW })).toHaveLength(0);
  });

  it("does not tag an old title", () => {
    expect(getContentTags(movie(day(-400)), { now: NOW })).toHaveLength(0);
  });

  it("gives a human reason, so the tooltip is checkable", () => {
    expect(getContentTags(movie(day(0)), { now: NOW })[0].reason).toBe("Released today");
    expect(getContentTags(movie(day(-1)), { now: NOW })[0].reason).toBe("Released yesterday");
    expect(getContentTags(movie(day(-5)), { now: NOW })[0].reason).toBe("Released 5 days ago");
  });
});

describe("getContentTags — it must not lie", () => {
  const NOW2 = Date.parse("2026-06-15T09:30:00Z");
  const day = (offset) => new Date(NOW2 + offset * 86400000).toISOString().slice(0, 10);

  it("never tags a title that has NOT come out yet", () => {
    // CountdownBadge owns the "coming soon" state; calling it NEW would be false.
    const soon = { id: "movie-2", isSeries: false, releaseDate: day(3) };
    expect(getContentTags(soon, { now: NOW2 })).toHaveLength(0);
  });

  it("stays silent when the card already shows an equivalent label", () => {
    // formattedRelease means a TODAY/TOMORROW/weekday chip is already rendered.
    const both = { id: "movie-3", isSeries: false, releaseDate: day(-1), formattedRelease: "TOMORROW" };
    expect(getContentTags(both, { now: NOW2 })).toHaveLength(0);
  });

  it("returns [] for a title with no date at all rather than guessing", () => {
    expect(getContentTags({ id: "movie-4", isSeries: false }, { now: NOW2 })).toHaveLength(0);
    expect(getContentTags(null, { now: NOW2 })).toHaveLength(0);
    expect(getContentTags(undefined, { now: NOW2 })).toHaveLength(0);
  });

  it("works for series too, not just movies", () => {
    const series = { id: "tv-55", isSeries: true, releaseDate: day(-2) };
    expect(getContentTags(series, { now: NOW2 })).toHaveLength(1);
  });

  it("respects a custom window so the rule stays configurable and testable", () => {
    const m = { id: "movie-5", isSeries: false, releaseDate: day(-20) };
    expect(getContentTags(m, { now: NOW2, windowDays: 30 })).toHaveLength(1);
    expect(getContentTags(m, { now: NOW2, windowDays: 7 })).toHaveLength(0);
  });
});
