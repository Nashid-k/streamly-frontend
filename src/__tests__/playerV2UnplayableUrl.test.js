import { describe, expect, it } from "vitest";
import { classifyResolve, extractPlayableUrl } from "../components/player/v2/hooks/usePlayerSource";
import { MODE, choosePlaybackMode, isPlayableMediaUrl } from "../components/player/v2/hooks/useHlsSource";
import { OUTCOME } from "../components/player/v2/sourceLadder";

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

/**
 * The extension-less resolver URL (live regression, 2026-10).
 *
 * Reported as: after the v2 player UI landed, "playback failed and no server has
 * this title now" on titles that had played a few commits earlier. Probing the
 * deployed `/api/downloadify` directly returned, for VidCore:
 *
 *   source.kind  = "hls"
 *   source.url   = "https://api.dlproxy.com/v1/play/AQZ..."   <- NO extension
 *   source.refUrl= "https://vidcore.io/"
 *   variants     = 6, v0.uri === source.url
 *
 * The fix in this batch had gated every candidate on `isPlayableMediaUrl`, i.e.
 * a `\.(m3u8|mp4)$` test. A CDN that streams under an opaque token path has no
 * such suffix, so the real master was rejected, every server classified RETRY,
 * and the ladder exhausted into that message. The resolver already tells us
 * `source.kind`; the extension is only a fallback for payloads that lack it.
 *
 * VidCore is Server 1, so this rejected the primary source for most titles.
 */
describe("extension-less resolver URLs use source.kind, not the suffix", () => {
  const vidcore = {
    source: {
      kind: "hls",
      url: "https://api.dlproxy.com/v1/play/AQZtR9kX2mN8pQ1vW4yB6cD0eF3gH5jL7sU",
      refUrl: "https://vidcore.io/",
      multiLevelMaster: "",
    },
    variants: [{ uri: "https://api.dlproxy.com/v1/play/AQZtR9kX2mN8pQ1vW4yB6cD0eF3gH5jL7sU" }],
  };

  it("extractPlayableUrl returns the extension-less master when kind is hls", () => {
    expect(extractPlayableUrl(vidcore)).toBe(vidcore.source.url);
    // The premise: the suffix test alone cannot see that this is media.
    expect(isPlayableMediaUrl(vidcore.source.url)).toBe(false);
  });

  it("extractPlayableUrl trusts an extension-less kind=file payload too", () => {
    const payload = { source: { kind: "file", url: "https://cdn.example.com/download?id=42" } };
    expect(extractPlayableUrl(payload)).toBe("https://cdn.example.com/download?id=42");
  });

  it("classifyResolve settles instead of retrying, so the ladder stops at Server 1", () => {
    expect(classifyResolve(vidcore)).toBe(OUTCOME.SETTLED);
  });

  it("choosePlaybackMode routes an extension-less hls master to hls.js, not native", () => {
    expect(
      choosePlaybackMode(vidcore.source.url, { mediaKind: "hls", hlsSupported: true, canPlayNative: false }),
    ).toBe(MODE.HLSJS);
    // On a browser with native HLS (Safari) the same master goes native.
    expect(
      choosePlaybackMode(vidcore.source.url, { mediaKind: "hls", hlsSupported: false, canPlayNative: true }),
    ).toBe(MODE.NATIVE);
  });

  it("choosePlaybackMode still refuses a page when no kind is supplied", () => {
    // The kind does not become a blanket bypass: an untagged page stays refused.
    expect(choosePlaybackMode("https://vidcore.io/", { canPlayNative: true, hlsSupported: true })).toBe(
      MODE.NONE,
    );
  });
});