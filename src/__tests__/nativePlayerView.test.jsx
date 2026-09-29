import { describe, expect, it, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import NativePlayerView from "../components/NativePlayerView";

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
    const { container } = render(
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
    // Full-screen blurred backdrop behind it.
    const backdrop = stage.querySelector(".np-loading-art");
    expect(backdrop).toBeTruthy();
    expect(backdrop.getAttribute("src")).toBe("https://image.test/backdrop.jpg");
    // The horizontal loader line sits under the title, animating a red segment.
    const line = stage.querySelector(".np-loading-line");
    expect(line).toBeTruthy();
    const sweep = line.querySelector("span");
    expect(sweep.style.animation).toContain("npLoadingLine");
  });

  it("keeps the title-only layout honest when no art is available", () => {
    const { container } = render(
      <NativePlayerView type="movie" id="550" title="Fight Club" onClose={() => {}} />,
    );
    const stage = screen.getByRole("status", { name: "Loading video" });
    expect(stage.querySelector(".np-loading-poster")).toBeNull();
    expect(stage.querySelector(".np-loading-art")).toBeNull();
    // The line still loads — a black stage never looks frozen.
    expect(stage.querySelector(".np-loading-line")).toBeTruthy();
  });
});
