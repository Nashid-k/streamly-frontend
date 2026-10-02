import { describe, expect, it } from "vitest";
import { extractPlayableUrl } from "../components/player/v2/hooks/usePlayerSource";
import { MODE, choosePlaybackMode, isPlayableMediaUrl } from "../components/player/v2/hooks/useHlsSource";

/**
 * A provider page used to reach `<video src>`.
 *
 * Reported as: `native playback {url: 'https://vidcore.io/'}` followed by
 * `Loading media from 'https://vidcore.io/' violates ... media-src 'self' blob:`.
 * Two independent bugs stacked up to make that possible, and each is pinned
 * separately here, because fixing only one leaves the other to bite on the next
 * provider:
 *
 *   1. `extractPlayableUrl` returned `refUrl` (the REFERER) as the stream.
 *   2. `choosePlaybackMode` answered MODE.NATIVE for anything not `.m3u8`, so a
 *      page URL was accepted as "progressive media" and handed to the element.
 */
describe("extractPlayableUrl", () => {
  it("never returns the referer when it is a provider page, not media", () => {
    // The exact shape that produced the black player in the field.
    const payload = {
      source: { url: "", refUrl: "https://vidcore.io/", multiLevelMaster: false },
    };
    expect(extractPlayableUrl(payload)).toBe("");
  });

  it("prefers the real stream over a page-shaped referer", () => {
    const payload = {
      source: {
        url: "https://cdn.example.com/hls/master.m3u8",
        refUrl: "https://vidcore.io/",
        multiLevelMaster: false,
      },
    };
    expect(extractPlayableUrl(payload)).toBe("https://cdn.example.com/hls/master.m3u8");
  });

  it("still uses refUrl when it is the only real media URL", () => {
    // Some providers put the manifest in refUrl. That must keep working - the
    // fix rejects PAGES, not every referer.
    const payload = {
      source: { url: "https://vidcore.io/", refUrl: "https://cdn.example.com/x.m3u8" },
    };
    expect(extractPlayableUrl(payload)).toBe("https://cdn.example.com/x.m3u8");
  });

  it("opens a multi-level master from source.url", () => {
    const payload = {
      source: {
        url: "https://cdn.example.com/hls/master.m3u8",
        refUrl: "https://vidcore.io/",
        multiLevelMaster: true,
      },
    };
    expect(extractPlayableUrl(payload)).toBe("https://cdn.example.com/hls/master.m3u8");
  });

  it("returns an empty string when nothing is playable, so the ladder advances", () => {
    expect(extractPlayableUrl(undefined)).toBe("");
    expect(extractPlayableUrl({})).toBe("");
    expect(extractPlayableUrl({ source: {} })).toBe("");
  });
});

describe("isPlayableMediaUrl", () => {
  it("accepts media and rejects pages", () => {
    expect(isPlayableMediaUrl("https://cdn.example.com/a/master.m3u8")).toBe(true);
    expect(isPlayableMediaUrl("https://cdn.example.com/a/movie.mp4")).toBe(true);
    expect(isPlayableMediaUrl("https://cdn.example.com/a/master.m3u8?token=1")).toBe(true);
    expect(isPlayableMediaUrl("https://vidcore.io/")).toBe(false);
    expect(isPlayableMediaUrl("https://vidcore.io/embed/abc123")).toBe(false);
    expect(isPlayableMediaUrl("")).toBe(false);
  });

  it("does not treat a lookalike query string as media", () => {
    // `.m3u8` has to be the path, not something a page put in its query.
    expect(isPlayableMediaUrl("https://vidcore.io/?next=master.m3u8")).toBe(false);
  });
});

describe("choosePlaybackMode refuses a page URL", () => {
  it("will not play a provider homepage natively", () => {
    // The regression. This branch used to return MODE.NATIVE, which set
    // `<video src="https://vidcore.io/">` and tripped the media-src CSP.
    expect(choosePlaybackMode("https://vidcore.io/", { canPlayNative: false, hlsSupported: true })).toBe(
      MODE.NONE,
    );
  });

  it("will not let injected capabilities force a page URL into native", () => {
    // `caps.isHls` must not be able to wave a non-media URL through.
    expect(choosePlaybackMode("https://vidcore.io/", { isHls: true, canPlayNative: true })).toBe(
      MODE.NONE,
    );
  });

  it("still plays progressive media natively", () => {
    expect(choosePlaybackMode("https://cdn.example.com/movie.mp4", { canPlayNative: false })).toBe(
      MODE.NATIVE,
    );
  });
});