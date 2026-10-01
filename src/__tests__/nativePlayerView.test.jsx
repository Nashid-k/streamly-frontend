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
    // The logo IS the title: no plain-text name next to it (user order).
    // Scoped to the stage — the player's top bar shows the title elsewhere.
    const stageText = Array.from(stage.querySelectorAll("div")).find((d) => d.textContent === "Fight Club");
    expect(stageText).toBeUndefined();
    // Full-screen blurred backdrop behind it.
    const backdrop = stage.querySelector(".np-loading-art");
    expect(backdrop).toBeTruthy();
    expect(backdrop.getAttribute("src")).toBe("https://image.test/backdrop.jpg");
    // The Tailspin conic ring sits under the art (ZXC composition).
    const ring = stage.querySelector(".np-tailspin > span");
    expect(ring).toBeTruthy();
  });

  it("keeps the title-only layout honest when no art is available", () => {
    const { container } = render(
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
    // The Tailspin ring still loads — a black stage never looks frozen.
    expect(stage.querySelector(".np-tailspin > span")).toBeTruthy();
  });

  /* The loading stage used to rotate nine invented lines ("Reticulating
     splines...", "Grabbing the popcorn...", "Finding the best quality...") on a
     2.5s timer beneath the title. None of them were facts or progress: they
     described work the player was not doing, and they rotated on a fixed clock
     whatever the loader was actually doing. So a stalled buffer was paired with
     text claiming it was "Finding the best quality..." — the player narrating
     fiction about its own state. Asserted as a literal scan because the
     failure mode is content, and no behavioural test catches invented copy. */
  it("never shows fabricated loading text", () => {
    render(
      <NativePlayerView
        type="movie"
        id="550"
        title="Fight Club"
        onClose={() => {}}
        backdropUrl="https://image.test/backdrop.jpg"
      />,
    );
    const stage = screen.getByRole("status", { name: "Loading video" });
    const text = stage.textContent || "";
    for (const fiction of [
      "Reticulating splines",
      "Warming up the projector",
      "Dimming the lights",
      "Grabbing the popcorn",
      "Tuning the audio",
      "Finding the best quality",
      "Rolling film",
      "Silencing cellphones",
      "Preparing the stream",
    ]) {
      expect(text, `fabricated loading copy: "${fiction}"`).not.toContain(fiction);
    }
  });

  it("has no loading-text rotator left to re-invent copy", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../components/NativePlayerView.jsx"),
      "utf8",
    );
    // A source scan, because the fabricated line lived in the BUFFERING overlay
    // rather than the loading stage: it only mounts when buffering is true,
    // which jsdom never reaches (it takes the fatal no-MediaSource path). So
    // there is no mount that can observe it — only the source can.
    expect(src, "the rotating copy table is gone").not.toContain("FUN_FACTS");
    // The rotator advanced that table on a 2.5s interval. Matched on the
    // setInterval shape rather than the bare number 2500, so an unrelated 2500ms
    // timeout added later cannot fail this guard for the wrong reason.
    expect(
      src,
      "no setInterval rotates loading copy any more",
    ).not.toMatch(/setInterval[\s\S]{0,200}?(LoadingMessage|\[i\]\s*\+\s*1)/);
    // The honest part stays: the component still renders the real title.
    expect(src).toMatch(/Loading \{title\}/);
  });

  it("reports the wait honestly on the loading stage", () => {
    render(<NativePlayerView type="movie" id="550" title="Fight Club" onClose={() => {}} />);
    const stage = screen.getByRole("status", { name: "Loading video" });
    // Title plus the wait notice, nothing else. The stage must never pad this
    // with copy that describes work the player is not doing.
    expect(stage.textContent).toBe("Fight ClubLoading…");
  });
});

/* The audio sheet's single-track case: when a stream carries no #EXT-X-MEDIA
   AUDIO groups, hls.js reports zero audioTracks and the soundtrack that IS
   playing gets surfaced as one row. That row used to render as an ordinary
   DialogRow with no onClick, which produced a focusable <button> that looked
   clickable, reported aria-pressed, and did nothing on activation — advertising
   a control that is not one. Reachable here without HLS: jsdom takes the fatal
   path, and the audio panel is only behind a click, so this asserts the row
   component contract directly against the source rather than the full flow. */
describe("legacy audio sheet: the single Original track is not a control", () => {
  it("renders readOnly rows as plain divs with no button semantics", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../components/NativePlayerView.jsx"),
      "utf8",
    );
    // The Original row must opt into readOnly...
    expect(src).toMatch(/key="original"\s+readOnly/);
    // ...and DialogRow must honour it by not rendering a button.
    expect(src).toMatch(/if\s*\(readOnly\)\s*\{\s*return\s*\(\s*<div/);
    // The row it replaced had no onClick at all — that was the defect, so the
    // source must not regress back to a clickable-looking Original row.
    expect(src).not.toMatch(/key="original"[\s\S]{0,220}?\n\s*onClick/);
  });
});
