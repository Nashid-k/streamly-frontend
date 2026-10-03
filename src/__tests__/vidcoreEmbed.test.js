import { describe, it, expect } from "vitest";
import { vidcoreEmbedUrl, shouldOfferVidcoreEmbed } from "../api/vidcoreEmbed";

describe("vidcoreEmbedUrl", () => {
  it("builds a movie URL on the vidcore origin with the app accent", () => {
    expect(vidcoreEmbedUrl({ type: "movie", id: 27205 })).toBe(
      "https://vidcore.io/movie/27205?theme=0A84FF&autoPlay=true",
    );
  });

  it("builds a TV URL carrying season and episode", () => {
    expect(vidcoreEmbedUrl({ type: "tv", id: 1399, season: 1, episode: 4 })).toBe(
      "https://vidcore.io/tv/1399/1/4?theme=0A84FF&autoPlay=true",
    );
  });

  it("accepts numeric ids passed as strings", () => {
    expect(vidcoreEmbedUrl({ type: "movie", id: "27205" })).toContain("/movie/27205?");
  });

  /* The resolver is TMDB-keyed everywhere else, so a TV title missing its
     season/episode must degrade to a movie URL rather than emit `/tv/1399/undef`. */
  it("falls back to a movie URL when a TV id has no season or episode", () => {
    expect(vidcoreEmbedUrl({ type: "tv", id: 1399 })).toContain("/movie/1399?");
    expect(vidcoreEmbedUrl({ type: "tv", id: 1399, season: 1 })).toContain("/movie/1399?");
    expect(vidcoreEmbedUrl({ type: "tv", id: 1399, season: "", episode: "" })).toContain(
      "/movie/1399?",
    );
  });

  it("honours a custom theme and autoplay=false", () => {
    expect(vidcoreEmbedUrl({ type: "movie", id: 27205, theme: "FF0000", autoPlay: false })).toBe(
      "https://vidcore.io/movie/27205?theme=FF0000&autoPlay=false",
    );
  });

  it("returns null when there is no usable numeric id", () => {
    expect(vidcoreEmbedUrl({ type: "movie", id: undefined })).toBeNull();
    expect(vidcoreEmbedUrl({ type: "movie", id: "" })).toBeNull();
    expect(vidcoreEmbedUrl({ type: "movie", id: "abc" })).toBeNull();
    expect(vidcoreEmbedUrl({ type: "movie", id: "12a4" })).toBeNull();
    expect(vidcoreEmbedUrl()).toBeNull();
  });

  it("rejects an id long enough to be an injection attempt", () => {
    expect(vidcoreEmbedUrl({ type: "movie", id: "1/../../etc" })).toBeNull();
    expect(vidcoreEmbedUrl({ type: "movie", id: "1?x=2" })).toBeNull();
  });
});

describe("shouldOfferVidcoreEmbed", () => {
  it("offers the embed after the auto rotation exhausts every source", () => {
    expect(shouldOfferVidcoreEmbed({ requestedServerKey: null })).toBe(true);
  });

  /* An explicit pick is honoured, unless the pick IS vidcore - then the embed
     is exactly the server that was asked for. */
  it("honours an explicit non-vidcore pick", () => {
    expect(shouldOfferVidcoreEmbed({ requestedServerKey: "vidsrc" })).toBe(false);
    expect(shouldOfferVidcoreEmbed({ requestedServerKey: "zxc-atlas" })).toBe(false);
  });

  it("offers the embed when vidcore itself was the explicit pick", () => {
    expect(shouldOfferVidcoreEmbed({ requestedServerKey: "vidcore" })).toBe(true);
  });

  it("never loops - a second attempt after a fallback is refused", () => {
    expect(shouldOfferVidcoreEmbed({ requestedServerKey: null, embedAttempted: true })).toBe(false);
  });
});