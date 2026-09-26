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
