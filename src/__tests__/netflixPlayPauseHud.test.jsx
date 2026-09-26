import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NetflixPlayPauseHUD } from "../components/player";
import { hudMetrics } from "../constants/playerUi";

const DESKTOP = hudMetrics(1280, 720);
const PHONE = hudMetrics(390, 844);

/* The squircle box is the overlay's first (and only) element child. */
const innerBox = (container) => container.firstElementChild.firstElementChild;

describe("NetflixPlayPauseHUD", () => {
  it("renders a decorative, click-through overlay", () => {
    const { container } = render(<NetflixPlayPauseHUD kind="play" metrics={DESKTOP} />);
    const overlay = container.firstElementChild;
    expect(overlay.style.pointerEvents).toBe("none");
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
  });

  it("exposes the NEW state via data-kind (play after a pause, pause after a play)", () => {
    const play = render(<NetflixPlayPauseHUD kind="play" metrics={DESKTOP} />);
    const pause = render(<NetflixPlayPauseHUD kind="pause" metrics={DESKTOP} />);
    expect(play.container.firstElementChild.getAttribute("data-kind")).toBe("play");
    expect(pause.container.firstElementChild.getAttribute("data-kind")).toBe("pause");
  });

  it("renders a filled glyph (YouTube-style solid icon, no stroke)", () => {
    const { container } = render(<NetflixPlayPauseHUD kind="play" metrics={DESKTOP} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("fill")).toBe("#fff");
  });

  it("sizes the squircle from the measured frame, clamped for phone and 4K", () => {
    const desktop = render(<NetflixPlayPauseHUD kind="play" metrics={DESKTOP} />);
    const phone = render(<NetflixPlayPauseHUD kind="play" metrics={PHONE} />);
    // 720p frame → scale 1 → 96px; phone short edge → sub-linear scale clamps to the 72px floor.
    expect(innerBox(desktop.container).style.width).toBe("96px");
    expect(innerBox(phone.container).style.width).toBe("72px");
    expect(Number.parseInt(innerBox(desktop.container).style.width, 10)).toBeGreaterThan(
      Number.parseInt(innerBox(phone.container).style.width, 10),
    );
  });

  it("falls back to the reference frame before the first measurement", () => {
    const { container } = render(<NetflixPlayPauseHUD kind="pause" />);
    expect(innerBox(container).style.width).toBe("96px");
  });
});
