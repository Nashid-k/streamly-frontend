import { describe, expect, it, beforeAll } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import NativePlayerView from "../components/NativePlayerView";
import { LoadingStage } from "../components/player/chrome/primitives";

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
});

/* The loading stage the viewer stares at while a stream resolves: the title
   image centred over a blurred full-screen backdrop, with the horizontal
   loader line under the title. jsdom takes the fatal path (no MediaSource),
   which leaves the stage mounted — exactly the pass whose DOM we assert. */
describe("NativePlayerView loading stage", () => {
  it("renders the title image and the horizontal loader line under the title", () => {
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
    // INITIAL cold open: the loader is the horizontal sweep, not the ring.
    expect(stage.querySelector(".np-loading-line > span")).toBeTruthy();
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
    // The horizontal sweep still loads — a black stage never looks frozen.
    expect(stage.querySelector(".np-loading-line > span")).toBeTruthy();
  });
});

/* The horizontal sweep is for the two SERVER-level cold opens — the very first
   load and a manual server switch (the component passes `initial=true` for
   both). Every other later cold stage (quality/dub/episode) passes
   `initial=false` and keeps the round Tailspin ring. */
describe("LoadingStage loader variant", () => {
  it("sweeps horizontally only while `initial`, and rings otherwise", () => {
    const { container: first, unmount } = render(
      <LoadingStage title="Fight Club" initial />,
    );
    expect(first.querySelector(".np-loading-line > span")).toBeTruthy();
    expect(first.querySelector(".np-tailspin")).toBeNull();
    unmount();

    const { container: later } = render(
      <LoadingStage title="Fight Club" initial={false} />,
    );
    expect(later.querySelector(".np-tailspin > span")).toBeTruthy();
    expect(later.querySelector(".np-loading-line")).toBeNull();
  });
});
