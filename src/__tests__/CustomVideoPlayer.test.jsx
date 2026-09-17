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

function renderPlayer(preset = "classic") {
  // The player reads playerUIPreset from preferences (like the real app),
  // so the test stores it the same way Settings does.
  localStorage.setItem("setting-playerUIPreset", JSON.stringify(preset));
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

describe("CustomVideoPlayer skins", () => {
  it("mounts without crashing for every preset (TDZ regression guard)", () => {
    for (const preset of ["classic", "minimal", "compact", "theater", "studio"]) {
      const { unmount } = renderPlayer(preset);
      expect(screen.getByTitle("Video player")).toBeInTheDocument();
      unmount();
    }
  });

  it("emits each preset's full-UI tokens on the player root", () => {
    const { container, unmount } = renderPlayer("theater");
    const root = container.querySelector(".streamly-player");
    expect(root).toBeInTheDocument();
    expect(root.dataset.playerSkin).toBe("theater");
    expect(root.style.getPropertyValue("--skin-hud-bg")).toContain("26,16,6");
    expect(root.style.getPropertyValue("--skin-hud-radius")).toBe("22px");
    expect(root.style.getPropertyValue("--skin-font-body")).toContain("Georgia");
    expect(root.style.getPropertyValue("--skin-vignette")).not.toBe("none");
    unmount();
  });

  it("switching presets swaps the emitted token set end-to-end", () => {
    const classic = renderPlayer("classic");
    const root = classic.container.querySelector(".streamly-player");
    expect(root.dataset.playerSkin).toBe("classic");
    expect(root.style.getPropertyValue("--skin-vignette")).toBe("none");
    expect(root.style.getPropertyValue("--skin-bar-inset")).toBe("0px");
    const classicHud = root.style.getPropertyValue("--skin-hud-bg");
    classic.unmount();

    const material = renderPlayer("material");
    const root2 = material.container.querySelector(".streamly-player");
    expect(root2.dataset.playerSkin).toBe("material");
    expect(root2.style.getPropertyValue("--skin-hud-bg")).not.toBe(classicHud);
    expect(root2.style.getPropertyValue("--skin-bar-inset")).toBe("14px");
    expect(root2.style.getPropertyValue("--skin-hud-radius")).toBe("20px");
    material.unmount();
  });

  it("keeps the player interactive after preset swaps (error boundary not hit)", () => {
    const { container } = renderPlayer("studio");
    expect(document.body.textContent).not.toContain("Oops! Something went wrong");
    expect(container.querySelector(".streamly-player")).toBeInTheDocument();
  });

  it("renders all controls including aspectRatio and brightness without crashing", () => {
    localStorage.setItem(
      "setting-playerControls",
      JSON.stringify({
        playPause: true,
        backward: true,
        forward: true,
        volume: true,
        subtitles: true,
        audio: true,
        aspectRatio: true,
        playbackSpeed: true,
        fullscreen: true,
        pip: true,
        server: true,
        source: true,
        brightness: true,
        chapters: true,
      })
    );
    localStorage.setItem(
      "setting-playerUILayout",
      JSON.stringify({
        aspectRatio: "bottomRight",
        brightness: "bottomRight",
      })
    );
    const { container } = render(
      <PreferencesProvider>
        <CustomVideoPlayer
          movie={MOVIE}
          servers={VideoSourceAdapter.getServers()}
        />
      </PreferencesProvider>
    );
    const root = container.querySelector(".streamly-player");
    expect(root).toBeInTheDocument();
    
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
      fireEvent.mouseMove(root);
    });
    
    
    // Now that it's "playing" and hovered, controls should mount
    expect(container.querySelector('[aria-label*="aspect ratio" i]')).toBeInTheDocument();
    expect(container.querySelector('[aria-label*="brightness" i]')).toBeInTheDocument();
  });
});

describe("CineSrc embed params follow the integration docs", () => {
  it("appends seek from the seekTime pref and no autoskip for movies", () => {
    const { container } = renderPlayer("classic");
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
});

