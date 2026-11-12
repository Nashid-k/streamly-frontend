import { describe, expect, it } from "vitest";
import {
  ROTATING_RAIL_DOMAINS,
  STREAMING_PROVIDERS,
  homeRailDayKey,
  pickHomeRailDomains,
  resolveRailRequest,
} from "../data/homeRailDomains";

/* The home feed's tail is ten "domain" rails chosen by a date-seeded shuffle.
   These tests pin the three properties that make that safe:
     - the same day always yields the same ten (a re-mount cannot reshuffle the
       page under the viewer),
     - a different day yields a different set (the page is not static),
     - the ten alternate film/series and never repeat a domain. */

const noonOf = (iso) => new Date(`${iso}T12:00:00`);

describe("home rail rotation", () => {
  it("keys the rotation to the local calendar day", () => {
    expect(homeRailDayKey(noonOf("2026-11-12"))).toBe("2026-11-12");
    expect(homeRailDayKey(noonOf("2026-01-05"))).toBe("2026-01-05");
  });

  it("picks ten unique rails for a day", () => {
    const picked = pickHomeRailDomains(noonOf("2026-11-12"));
    expect(picked).toHaveLength(10);
    expect(new Set(picked.map((d) => d.key)).size).toBe(10);
    for (const domain of picked) {
      expect(ROTATING_RAIL_DOMAINS).toContain(domain);
    }
  });

  it("is deterministic for the same day", () => {
    const a = pickHomeRailDomains(noonOf("2026-11-12")).map((d) => d.key);
    const b = pickHomeRailDomains(noonOf("2026-11-12")).map((d) => d.key);
    expect(a).toEqual(b);
  });

  it("alternates film and series rails", () => {
    const picked = pickHomeRailDomains(noonOf("2026-11-12"));
    for (let i = 1; i < picked.length; i += 1) {
      expect(picked[i].mediaType).not.toBe(picked[i - 1].mediaType);
    }
  });

  it("changes the rail set from one day to the next", () => {
    const sets = new Set();
    for (const iso of ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]) {
      sets.add(pickHomeRailDomains(noonOf(iso)).map((d) => d.key).join(","));
    }
    expect(sets.size).toBeGreaterThan(1);
  });

  it("expands decade and recent-year recipes into request windows", () => {
    const nineties = ROTATING_RAIL_DOMAINS.find((d) => d.key === "movie-90s-thrillers");
    const request = resolveRailRequest(nineties, noonOf("2026-11-12"));
    expect(request.fromYear).toBe(1990);
    expect(request.toYear).toBe(1999);
    expect(request.mediaType).toBe("movie");
    expect(request.sortBy).toBeUndefined();

    const fresh = ROTATING_RAIL_DOMAINS.find((d) => d.key === "tv-fresh");
    const freshRequest = resolveRailRequest(fresh, noonOf("2026-11-12"));
    expect(freshRequest.mediaType).toBe("tv");
    expect(freshRequest.sortBy).toBe("newest");
    expect(freshRequest.toYear).toBe(2026);
    expect(freshRequest.fromYear).toBe(2025);
  });

  it("keeps every recipe key and label unique", () => {
    expect(new Set(ROTATING_RAIL_DOMAINS.map((d) => d.key)).size).toBe(
      ROTATING_RAIL_DOMAINS.length,
    );
    expect(new Set(ROTATING_RAIL_DOMAINS.map((d) => d.label)).size).toBe(
      ROTATING_RAIL_DOMAINS.length,
    );
  });
});

describe("streaming providers", () => {
  it("lists the six services the provider rails offer", () => {
    expect(STREAMING_PROVIDERS.map((p) => p.name)).toEqual([
      "Netflix",
      "Hulu",
      "Disney+",
      "Prime Video",
      "Max",
      "Apple TV+",
    ]);
    expect(new Set(STREAMING_PROVIDERS.map((p) => p.id)).size).toBe(
      STREAMING_PROVIDERS.length,
    );
  });
});
