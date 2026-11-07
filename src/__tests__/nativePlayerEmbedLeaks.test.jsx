import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import NativePlayerView from "../components/NativePlayerView";
import { SubtitleFetcher } from "../api/subtitleFetcher";
import { fetchSkipBoundaries } from "../api/skipBoundarySource";
import { fetchZxcIntroBounds } from "../api/skipProviderSource";

/* Embed mode is the provider's own cross-origin player. Native work that only
   exists to feed OUR player — the OpenSubtitles search, the skip-marker
   lookups, the media-session handlers — must not run behind the iframe: it is
   invisible there, costs requests, and (for the media session) would answer
   hardware keys against a detached, src-less element. */

vi.mock("../api/subtitleFetcher", () => ({
  SubtitleFetcher: {
    searchAvailableSubtitles: vi.fn(() => Promise.resolve([])),
    downloadAndDecompress: vi.fn(() => Promise.resolve("")),
  },
}));

vi.mock("../api/skipBoundarySource", () => ({
  fetchSkipBoundaries: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../api/skipProviderSource", () => ({
  fetchZxcIntroBounds: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../api/warmResolve", () => ({
  takeWarmResolve: vi.fn(() => null),
  prefetchSources: vi.fn(() => () => {}),
  warmResolve: vi.fn(() => Promise.resolve(null)),
}));

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

const playerProps = {
  type: "tv",
  id: "1399",
  season: 1,
  episode: 1,
  title: "Game of Thrones",
  imdbId: "tt0944947",
  onClose: () => {},
};

describe("embed mode skips native-only work", () => {
  it("does not fetch subtitles or skip boundaries behind the iframe", async () => {
    render(<NativePlayerView {...playerProps} playerMode="embed" />);

    // Let every mount effect run and settle.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(SubtitleFetcher.searchAvailableSubtitles).not.toHaveBeenCalled();
    expect(fetchSkipBoundaries).not.toHaveBeenCalled();
    expect(fetchZxcIntroBounds).not.toHaveBeenCalled();
  });

  it("still runs them in Streamly mode (the gate is the mode, not a stub)", async () => {
    render(<NativePlayerView {...playerProps} />);

    await waitFor(() => expect(SubtitleFetcher.searchAvailableSubtitles).toHaveBeenCalled());
    await waitFor(() => expect(fetchSkipBoundaries).toHaveBeenCalled());
    expect(fetchZxcIntroBounds).toHaveBeenCalled();
  });

  it("does not register native media-session handlers in embed", () => {
    const setActionHandler = vi.fn();
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: { setActionHandler, playbackState: "none" },
    });
    window.MediaMetadata = class {};
    try {
      render(<NativePlayerView {...playerProps} playerMode="embed" />);
      expect(setActionHandler).not.toHaveBeenCalled();
    } finally {
      delete navigator.mediaSession;
      delete window.MediaMetadata;
    }
  });

  it("registers them in Streamly mode", () => {
    const setActionHandler = vi.fn();
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: { setActionHandler, playbackState: "none" },
    });
    window.MediaMetadata = class {};
    try {
      render(<NativePlayerView {...playerProps} />);
      expect(setActionHandler).toHaveBeenCalledWith("play", expect.any(Function));
    } finally {
      delete navigator.mediaSession;
      delete window.MediaMetadata;
    }
  });
});
