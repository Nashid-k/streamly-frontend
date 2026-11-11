import { describe, expect, it, beforeAll } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import NativePlayerView from "../components/NativePlayerView";
import { LoadingStage } from "../components/player/chrome/primitives";
import { STILL_WATCHING_IDLE_MS } from "../constants/playerUi";

// jsdom has no ResizeObserver; the player measures its frame with it.
beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

/* Render-time TDZ guard: NativePlayerView assigns mirror refs and effects that
   read state/derivations during render. An out-of-order declaration survives
   the build (bundlers just rename the binding — twice shipped as "_r before
   initialization") and only explodes at render. jsdom has no MediaSource, so
   the mount takes the honest fatal path — the point is that the FULL render
   pass, every mirror assignment included, completes without throwing. */
describe("NativePlayerView (smoke)", () => {
  it("mounts the full render pass without a render-time crash", () => {
    const { container } = render(
      <NativePlayerView type="movie" id="550" title="Fight Club" onClose={() => {}} />,
    );
    expect(container).toBeTruthy();
  });

  it("reports a clean fatal when MediaSource is unavailable (jsdom)", () => {
    render(<NativePlayerView type="movie" id="550" title="Fight Club" onClose={() => {}} />);
    expect(
      screen.getByText(/no MediaSource support/i),
    ).toBeInTheDocument();
  });

  it("does not paint the native retry banner over the embed", () => {
    render(
      <NativePlayerView
        type="movie"
        id="550"
        title="Fight Club"
        playerMode="embed"
        onClose={() => {}}
      />,
    );
    // The CineSrc frame is the surface in embed mode...
    expect(screen.getByTitle("CineSrc embed player")).toBeInTheDocument();
    // ...and the native fatal (jsdom has no MediaSource) must not sit on top of
    // it: its message names a native source and its "Try again" re-runs the
    // native resolve, neither of which is true of the embed.
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/no MediaSource support/i)).not.toBeInTheDocument();
  });

  it("drops native-only overlays when switching to the embed", async () => {
    const { rerender } = render(
      <NativePlayerView
        type="tv"
        id="1399"
        season={1}
        episode={1}
        title="Game of Thrones"
        onClose={() => {}}
      />,
    );
    // Put the native playhead inside the Skip Intro window, then open the
    // settings sheet — both are native-only chrome that must not survive the
    // switch.
    const video = document.querySelector("video");
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 75,
    });
    fireEvent.timeUpdate(video);
    expect(
      screen.getByRole("button", { name: /skip the opening credits/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    rerender(
      <NativePlayerView
        type="tv"
        id="1399"
        season={1}
        episode={1}
        title="Game of Thrones"
        playerMode="embed"
        onClose={() => {}}
      />,
    );

    expect(screen.getByTitle("CineSrc embed player")).toBeInTheDocument();
    // The sheet unmounts with the mode gate; the Skip pill leaves through its
    // AnimatePresence exit.
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /skip the opening credits/i }),
      ).toBeNull();
    });
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  }, 15000);

  it("dismisses a pending Still watching prompt when entering the embed", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <NativePlayerView type="movie" id="550" title="Fight Club" onClose={() => {}} />,
      );
      const video = document.querySelector("video");
      // jsdom never starts playback; a live (unpaused) element is what the
      // still-watching offer requires.
      Object.defineProperty(video, "paused", {
        configurable: true,
        get: () => false,
      });
      act(() => {
        fireEvent.play(video);
      });
      // The 2h unattended-playback countdown.
      act(() => {
        vi.advanceTimersByTime(STILL_WATCHING_IDLE_MS);
      });
      expect(document.querySelector(".np-root").className).toContain("still-watching");

      rerender(
        <NativePlayerView type="movie" id="550" title="Fight Club" playerMode="embed" onClose={() => {}} />,
      );
      // Dismissed, not merely render-gated: the prompt must not be latched for
      // the switch back to native.
      expect(document.querySelector(".np-root").className).not.toContain("still-watching");

      rerender(
        <NativePlayerView type="movie" id="550" title="Fight Club" onClose={() => {}} />,
      );
      expect(document.querySelector(".np-root").className).not.toContain("still-watching");
    } finally {
      vi.useRealTimers();
    }
  }, 15000);
});

/* The loading stage the viewer stares at while a stream resolves: the title
   image centred over a blurred full-screen backdrop, with the neon
   player-loader GIF under the title. jsdom takes the fatal path (no
   MediaSource), which leaves the stage mounted — exactly the pass whose DOM
   we assert. */
describe("NativePlayerView loading stage", () => {
  it("renders the title image and the player-loader GIF under the title", () => {
    render(
      <NativePlayerView
        type="movie"
        id="550"
        title="Fight Club"
        onClose={() => {}}
        backdropUrl="https://image.test/backdrop.jpg"
        posterUrl="https://image.test/logo.png"
      />,
    );
    const stage = screen.getByRole("status", { name: "Loading video" });
    // The centrepiece is the title IMAGE (the TMDB logo passed as posterUrl).
    const art = stage.querySelector(".np-loading-poster");
    expect(art).toBeTruthy();
    expect(art.getAttribute("src")).toBe("https://image.test/logo.png");
    // The logo IS the title: no plain-text name next to it (user order).
    // Scoped to the stage — the player's top bar shows the title elsewhere.
    const stageText = Array.from(stage.querySelectorAll("div")).find((d) => d.textContent === "Fight Club");
    expect(stageText).toBeUndefined();
    // Full-screen blurred backdrop behind it.
    const backdrop = stage.querySelector(".np-loading-art");
    expect(backdrop).toBeTruthy();
    expect(backdrop.getAttribute("src")).toBe("https://image.test/backdrop.jpg");
    // INITIAL cold open: the loader is the animated logo GIF, not the ring.
    expect(stage.querySelector('img[src*="streamly-player-loader"]')).toBeTruthy();
    expect(stage.querySelector(".np-tailspin")).toBeNull();
  });

  it("hands the title slot to the text name when the logo file fails to load", () => {
    const { container } = render(
      <LoadingStage
        title="Fight Club"
        posterUrl="https://image.test/broken-logo.png"
        initial
      />,
    );
    const art = container.querySelector(".np-loading-poster");
    expect(art).toBeTruthy();

    fireEvent.error(art);

    // The broken art steps aside; the text title takes the slot it left —
    // an empty frame where the title should be reads as a bug, not a fallback.
    expect(container.querySelector(".np-loading-poster")).toBeNull();
    const fallback = Array.from(container.querySelectorAll("div")).find(
      (d) => d.textContent === "Fight Club" && d.style.fontSize.includes("clamp"),
    );
    expect(fallback).toBeTruthy();
  });

  it("keeps the title-only layout honest when no art is available", () => {
    render(
      <NativePlayerView type="movie" id="550" title="Fight Club" onClose={() => {}} />,
    );
    const stage = screen.getByRole("status", { name: "Loading video" });
    expect(stage.querySelector(".np-loading-poster")).toBeNull();
    expect(stage.querySelector(".np-loading-art")).toBeNull();
    // No logo art: the text name is the only honest identifier left — it shows
    // inside the stage (the fallback block with the clamp font size).
    const fallback = Array.from(stage.querySelectorAll("div")).find(
      (d) => d.textContent === "Fight Club" && d.style.fontSize.includes("clamp"),
    );
    expect(fallback).toBeTruthy();
    expect(fallback).toBeTruthy();
    // The player-loader GIF still loads — a black stage never looks frozen.
    expect(stage.querySelector('img[src*="streamly-player-loader"]')).toBeTruthy();
  });
});

/* The animated logo GIF is for the two SERVER-level cold opens — the very
   first load and a manual server switch (the component passes `initial=true`
   for both). Every other later cold stage (quality/dub/episode) passes
   `initial=false` and keeps the round Tailspin ring. */
describe("LoadingStage loader variant", () => {
  it("shows the animated logo only while `initial`, and rings otherwise", () => {
    const { container: first, unmount } = render(
      <LoadingStage title="Fight Club" initial />,
    );
    expect(first.querySelector('img[src*="streamly-player-loader"]')).toBeTruthy();
    expect(first.querySelector(".np-tailspin")).toBeNull();
    unmount();

    const { container: later } = render(
      <LoadingStage title="Fight Club" initial={false} />,
    );
    expect(later.querySelector(".np-tailspin > span")).toBeTruthy();
    expect(later.querySelector('img[src*="streamly-player-loader"]')).toBeNull();
  });
});
