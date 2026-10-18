import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pageLoaders } from "../app/routeLoaders";
import { routeLoaderForPath, WARM_ORDER, startRouteWarmup } from "../app/routeWarmup";

/* The warm-up has two halves: a pure path→loader map (this file's main
   surface) and a side-effecting bootstrap. The map is what makes hover
   prefetch land on the RIGHT chunk — a miss here means the user still gets a
   Suspense Loader flash, silently, so it is asserted per route shape. */

describe("routeLoaderForPath", () => {
  it("maps every navigable path shape to its page loader", () => {
    expect(routeLoaderForPath("/")).toBe(pageLoaders.home);
    expect(routeLoaderForPath("/movies")).toBe(pageLoaders.discovery);
    expect(routeLoaderForPath("/series")).toBe(pageLoaders.discovery);
    expect(routeLoaderForPath("/search")).toBe(pageLoaders.search);
    expect(routeLoaderForPath("/watch/movie-550/fight-club")).toBe(pageLoaders.titleDetails);
    expect(routeLoaderForPath("/person/61912")).toBe(pageLoaders.personDetails);
    expect(routeLoaderForPath("/category/Action")).toBe(pageLoaders.category);
    expect(routeLoaderForPath("/genre/Comedy")).toBe(pageLoaders.genre);
    expect(routeLoaderForPath("/history")).toBe(pageLoaders.history);
    expect(routeLoaderForPath("/settings")).toBe(pageLoaders.settings);
    expect(routeLoaderForPath("/explore/collections")).toBe(pageLoaders.exploreCollections);
    expect(routeLoaderForPath("/collections/abc123")).toBe(pageLoaders.publicCollection);
  });

  it("treats a trailing slash as the same route (only the root keeps it)", () => {
    expect(routeLoaderForPath("/movies/")).toBe(pageLoaders.discovery);
    expect(routeLoaderForPath("/")).toBe(pageLoaders.home);
  });

  it("maps legacy redirect aliases to the page the router lands on", () => {
    expect(routeLoaderForPath("/mylist")).toBe(pageLoaders.watchlist);
    expect(routeLoaderForPath("/continue-watching")).toBe(pageLoaders.history);
  });

  it("returns null where there is no lazy page to warm", () => {
    expect(routeLoaderForPath(null)).toBeNull();
    expect(routeLoaderForPath(undefined)).toBeNull();
    // Eager route — nothing to prefetch (VerifyEmailPage is imported statically).
    expect(routeLoaderForPath("/verify-email")).toBeNull();
    expect(routeLoaderForPath("/completely/unknown")).toBeNull();
  });
});

describe("WARM_ORDER", () => {
  it("covers every page loader so idle warm-up can never miss a page", () => {
    const warmed = new Set(WARM_ORDER);
    for (const [name, loader] of Object.entries(pageLoaders)) {
      expect(warmed.has(loader), `${name} is missing from WARM_ORDER`).toBe(true);
    }
  });
});

describe("startRouteWarmup", () => {
  beforeEach(() => {
    // "loading" keeps the deferred idle loop from kicking during the test —
    // the test exercises wiring, not a real multi-chunk download.
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a cleanup that detaches its document listeners", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const cleanup = startRouteWarmup();
    expect(typeof cleanup).toBe("function");
    cleanup();
    const removed = removeSpy.mock.calls.map(([type]) => type);
    expect(removed).toContain("mouseover");
    expect(removed).toContain("focusin");
  });

  it("ignores hover on links that leave the origin", () => {
    const cleanup = startRouteWarmup();
    const external = document.createElement("a");
    external.href = "https://example.com/settings";
    document.body.appendChild(external);
    // The delegated handler resolves the anchor, rejects the foreign origin and
    // never touches the promise map — a throw here fails the dispatch.
    expect(() =>
      external.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })),
    ).not.toThrow();
    cleanup();
    external.remove();
  });

  it("prefers a data-no-prefetch link over warming", () => {
    const cleanup = startRouteWarmup();
    const link = document.createElement("a");
    link.setAttribute("href", "/settings");
    link.setAttribute("data-no-prefetch", "");
    document.body.appendChild(link);
    expect(() =>
      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })),
    ).not.toThrow();
    cleanup();
    link.remove();
  });
});
