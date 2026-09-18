import { render, screen, fireEvent, act } from "@testing-library/react";
import CustomVideoPlayer from "../components/CustomVideoPlayer";
import { PreferencesProvider } from "../context/PreferencesContext";
import { VideoSourceAdapter } from "../api/videoSourceAdapter";

/* Regression guard for the TDZ-class crashes that used to blank the whole
   player behind "Oops! Something went wrong." — if CustomVideoPlayer ever
   references a binding before its declaration again, this suite fails. */

vi.mock("../api/movieService", () => ({
  movieService: {
    getExternalIds: vi.fn().mockResolvedValue({ imdbId: "tt0317705" }),
    getSimilarMovies: vi.fn().mockResolvedValue([]),
  },
}));

const MOVIE = { id: "movie-9806", title: "Ice Age", platform: "tmdb" };

/* jsdom lacks matchMedia; the player's touch detection reads (hover: none). */
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
/* framer-motion's layout animations need ResizeObserver in jsdom. */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function renderPlayer() {
  return render(
    <PreferencesProvider>
      <CustomVideoPlayer
        movie={MOVIE}
        servers={VideoSourceAdapter.getServers()}
      />
    </PreferencesProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
  console.warn.mockRestore();
});

describe("CustomVideoPlayer fixed Netflix chrome", () => {
  it("mounts without crashing (TDZ regression guard)", () => {
    const { unmount } = renderPlayer();
    expect(screen.getByTitle("Video player")).toBeInTheDocument();
    unmount();
  });

  it("emits the single fixed netflix skin on the player root", () => {
    const { container, unmount } = renderPlayer();
    const root = container.querySelector(".streamly-player");
    expect(root).toBeInTheDocument();
    expect(root.dataset.playerSkin).toBe("netflix");
    unmount();
  });

  it("keeps the player interactive on mount (error boundary not hit)", () => {
    const { container } = renderPlayer();
    expect(document.body.textContent).not.toContain("Oops! Something went wrong");
    expect(container.querySelector(".streamly-player")).toBeInTheDocument();
  });

  it("renders all controls including aspectRatio and brightness without crashing", () => {
    render(
      <PreferencesProvider>
        <CustomVideoPlayer
          movie={MOVIE}
          servers={VideoSourceAdapter.getServers()}
        />
      </PreferencesProvider>
    );
    const container = document.querySelector(".streamly-player");
    expect(container).toBeInTheDocument();
    
    const iframe = container.querySelector("iframe");
    if (iframe) fireEvent.load(iframe);
    
    // Simulate cinesrc player starting playback to set isLoading to false
    // so controls become visible and get rendered in the DOM.
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { 
          origin: "https://cinesrc.st",
          data: { type: "cinesrc:playing" } 
        })
      );
      fireEvent.mouseMove(container);
    });
    
    
    // Now that it's "playing" and hovered, controls should mount
    expect(container.querySelector('[aria-label*="aspect ratio" i]')).toBeInTheDocument();
    expect(container.querySelector('[aria-label*="brightness" i]')).toBeInTheDocument();
  });
});

describe("CineSrc embed params follow the integration docs", () => {
  it("appends seek from the seekTime pref and no autoskip for movies", () => {
    const { container } = renderPlayer();
    const src = container.querySelector("iframe").getAttribute("src");
    expect(src).toContain("cinesrc.st/embed/movie/9806?");
    expect(src).toContain("&seek=10");
    expect(src).not.toContain("autoskip");
    expect(src).not.toContain("continueprompt"); // no saved progress in test
  });

  it("appends autoskip matching the Auto-Skip Intro pref for TV episodes", () => {
    const { container } = render(
      <PreferencesProvider>
        <CustomVideoPlayer
          movie={{ id: "tmdb-tv-1396", title: "Game of Thrones", isSeries: true }}
          servers={VideoSourceAdapter.getServers()}
          season="1"
          episode="1"
        />
      </PreferencesProvider>
    );
    const src = container.querySelector("iframe").getAttribute("src");
    expect(src).toContain("cinesrc.st/embed/tv/1396?s=1&e=1");
    expect(src).toContain("&autoskip=false");
    expect(src).toContain("&seek=10");
  });

  it("never appends a quality param (undocumented getter output broke the playlist)", () => {
    localStorage.setItem("streamly_lastQuality", JSON.stringify({ id: "1080p", name: "1080" }));
    const { container } = renderPlayer();
    const src = container.querySelector("iframe").getAttribute("src");
    expect(src).not.toContain("quality=");
    localStorage.removeItem("streamly_lastQuality");
  });

  it("appends muted=true when the player was left muted", () => {
    localStorage.setItem("streamly_muted", "true");
    const { container } = renderPlayer();
    expect(container.querySelector("iframe").getAttribute("src")).toContain("&muted=true");
  });
});

describe("CineSrc owns its internal rotation (no auto-switch to Server 2+)", () => {
  it("shows the fallback UI instead of advancing away when CineSrc burns through its sources", () => {
    const onServerChange = vi.fn();
    const { container } = render(
      <PreferencesProvider>
        <CustomVideoPlayer
          movie={MOVIE}
          servers={VideoSourceAdapter.getServers()}
          onServerChange={onServerChange}
        />
      </PreferencesProvider>
    );
    const iframe = container.querySelector("iframe");
    const src = iframe.getAttribute("src");
    expect(src).toContain("cinesrc.st");

    // Two fatal manifestLoadError events for the same internal source (the
    // per-source strike threshold). The old code advanced to Server 2 from
    // here — per the docs the embed owns its rotation, so we must stay and
    // fall back to the Retry / pick-another-server UI instead.
    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: "https://cinesrc.st",
        data: { type: "cinesrc:error", error: { type: "hlsError", details: "manifestLoadError", fatal: true } },
      }));
      window.dispatchEvent(new MessageEvent("message", {
        origin: "https://cinesrc.st",
        data: { type: "cinesrc:error", error: { type: "hlsError", details: "manifestLoadError", fatal: true } },
      }));
    });

    // Never advanced: the iframe still points at CineSrc, no onServerChange.
    expect(container.querySelector("iframe").getAttribute("src")).toContain("cinesrc.st");
    expect(onServerChange).not.toHaveBeenCalled();

    // Fallback UI surfaced per the docs' "handle errors gracefully" guidance.
    expect(screen.getByText(/The stream couldn't start\./)).toBeInTheDocument();
  });
});

