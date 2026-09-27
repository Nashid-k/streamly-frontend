/* The resolver 400 that shipped in the APK: the app's frozen ids are
 * "movie-27205" / "tv-1399", and api/downloadify.js:270 and :385 validate the id
 * with /^\d{1,12}$/ and answer 400 `bad-id` for anything else. Verified live:
 *   {type:"movie", id:"movie-27205"} -> 400 bad-id   (626ms, what the APK sent)
 *   {type:"movie", id:"27205"}       -> 200, 4 variants (what the web sends)
 * The previous smoke test could not catch it because it built the request itself
 * instead of calling the app's own builder - so this pins the builder. */

import { describe, expect, it, vi } from "vitest";

/* The app's playlists are written to the app cache directory; nothing here touches
 * the filesystem, so the native module is stubbed out. */
vi.mock("expo-file-system", () => ({
  File: class {},
  Paths: { cache: "/tmp", document: "/tmp" },
}));

import { resolverPayload } from "./streams";

/* The rule the resolver actually enforces, copied from api/downloadify.js so the
 * test states the contract rather than the current value. */
const RESOLVER_ID = /^\d{1,12}$/;

describe("resolver payload: the id the resolver will accept", () => {
  it("unwraps a movie id instead of sending the prefixed one", () => {
    const body = resolverPayload("resolvevidcore", "movie", "movie-27205");
    expect(body).toEqual({ action: "resolvevidcore", type: "movie", id: "27205" });
    expect(body.id).toMatch(RESOLVER_ID);
  });

  it("unwraps a tv id and always sends both season and episode", () => {
    const body = resolverPayload("resolvevidcore", "tv", "tv-1399", 2, 7);
    expect(body).toEqual({
      action: "resolvevidcore",
      type: "tv",
      id: "1399",
      season: "2",
      episode: "7",
    });
    expect(body.id).toMatch(RESOLVER_ID);
  });

  it("trusts the id prefix over a missing type (deep links carry no type)", () => {
    /* LINKING maps streamly://play/:id with no type, so a series opened from a
     * link used to be asked for as a movie - the wrong source, not an error. */
    expect(resolverPayload("resolvevidcore", undefined, "tv-1399", 1, 1).type).toBe("tv");
    expect(resolverPayload("resolvevidcore", undefined, "movie-27205").type).toBe("movie");
  });

  it("never leaves a series without an episode, which the resolver answers as no-source", () => {
    const body = resolverPayload("resolvevidcore", "tv", "tv-1399");
    expect(body.season).toBe("1");
    expect(body.episode).toBe("1");
  });

  it("refuses an id with no digits in it, instead of sending a guaranteed 400", () => {
    expect(() => resolverPayload("resolvevidcore", "movie", "")).toThrow(/not a Streamly title id/);
    expect(() => resolverPayload("resolvevidcore", "movie", "movie-abc")).toThrow(
      /not a Streamly title id/,
    );
  });
});
