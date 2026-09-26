import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { hudMetrics, HUD_REFERENCE_EDGE } from "../constants/playerUi";
import { NetflixVolumeHUD, NetflixBrightnessHUD, NetflixAspectHUD, NetflixSeekHUD } from "../components/player";

/* The player HUD used to be positioned by a hardcoded percentage (`top="34%"`)
   and sized with vw clamps, so the overlay sat in the middle of the frame on
   one screen and off the top edge on the next — and there was no rewind/forward
   indicator at all. These tests pin the replacement: geometry derived from the
   measured frame, and a badge on each edge. */

const PHONE = hudMetrics(390, 844); // portrait phone
const DESKTOP = hudMetrics(1920, 1080); // 16:9 desktop
const TALL = hudMetrics(1280, 2160); // 4K panel in a wide window

describe("hudMetrics", () => {
  it("scales with the measured frame instead of the viewport", () => {
    expect(PHONE.scale).toBeLessThan(1);
    expect(DESKTOP.scale).toBeGreaterThan(1);
    expect(TALL.scale).toBeGreaterThan(DESKTOP.scale);
  });

  it("grows sub-linearly, so a 1080p frame is not a 1.5x HUD", () => {
    // Linear scaling on the short edge put a 1080p player at the 1.5x ceiling
    // (a 30px icon where the old desktop HUD used 20px). The curve is sqrt.
    expect(DESKTOP.scale).toBeCloseTo(Math.sqrt(1080 / HUD_REFERENCE_EDGE), 5);
    expect(DESKTOP.scale).toBeLessThan(1.3);
    expect(DESKTOP.pillIcon).toBeLessThanOrEqual(26);
  });

  it("places the pill in a top-anchored band, never mid-frame", () => {
    for (const m of [PHONE, DESKTOP, TALL]) {
      expect(m.top).toBeGreaterThan(0);
      // The old bug: 34% of the height put the pill in the middle of the
      // picture. Keep it in the top third on every frame size.
      expect(m.top).toBeLessThan(m.height * 0.25);
    }
  });

  it("grows the top offset with the frame but saturates instead of drifting", () => {
    const short = hudMetrics(1280, 480);
    const mid = hudMetrics(1280, 720);
    expect(short.top).toBeGreaterThan(0);
    expect(mid.top).toBeGreaterThan(short.top);
    // Tall frames saturate at the clamp rather than sliding down the picture.
    expect(TALL.top).toBeLessThanOrEqual(104);
    expect(PHONE.top).toBeLessThan(PHONE.height * 0.25);
  });

  it("anchors the seek badge to each edge by a fraction of the width", () => {
    expect(PHONE.seekInset).toBeGreaterThan(0);
    expect(DESKTOP.seekInset).toBeGreaterThan(PHONE.seekInset);
    expect(DESKTOP.seekInset).toBeLessThan(DESKTOP.width * 0.1);
    expect(TALL.seekInset).toBeLessThanOrEqual(88);
  });

  it("centres the seek badge vertically without a CSS translate", () => {
    for (const m of [PHONE, DESKTOP, TALL]) {
      const top = Math.round(m.seekCenter - m.seekDiameter / 2);
      expect(top).toBeGreaterThan(0);
      expect(top + m.seekDiameter).toBeLessThanOrEqual(m.height);
    }
  });

  it("falls back to the reference frame before the first measurement", () => {
    const unmeasured = hudMetrics(0, 0);
    const reference = hudMetrics(HUD_REFERENCE_EDGE, HUD_REFERENCE_EDGE);
    expect(unmeasured.scale).toBe(reference.scale);
    expect(unmeasured.top).toBe(reference.top);
    expect(unmeasured.seekInset).toBe(reference.seekInset);
    // The real measurement is still reported truthfully.
    expect(unmeasured.width).toBe(0);
    expect(unmeasured.height).toBe(0);
  });

  it("survives junk measurements instead of collapsing the HUD", () => {
    for (const bad of [[NaN, 1080], [1920, undefined], [null, null], ["x", "y"]]) {
      const m = hudMetrics(bad[0], bad[1]);
      expect(Number.isFinite(m.top)).toBe(true);
      expect(Number.isFinite(m.seekCenter)).toBe(true);
      expect(m.pillIcon).toBeGreaterThan(0);
      expect(m.seekDiameter).toBeGreaterThan(0);
    }
  });

  it("keeps every size positive and ordered at the extremes", () => {
    const tiny = hudMetrics(120, 90);
    const huge = hudMetrics(7680, 4320);
    for (const m of [tiny, huge]) {
      expect(m.pillIcon).toBeGreaterThan(0);
      expect(m.barHeight).toBeGreaterThan(0);
      expect(m.valueMinWidth).toBeGreaterThan(0);
      expect(m.seekDiameter).toBeGreaterThan(0);
    }
    expect(huge.pillIcon).toBeGreaterThan(tiny.pillIcon);
    expect(tiny.pillIcon).toBeGreaterThanOrEqual(16);
  });
});

describe("NetflixSeekHUD", () => {
  it("renders the rewind badge against the left edge", () => {
    const { container } = render(<NetflixSeekHUD direction="back" metrics={DESKTOP} seconds={10} />);
    const badge = container.firstElementChild;
    expect(badge.style.left).toBe(`${DESKTOP.seekInset}px`);
    expect(badge.style.right).toBe("");
    expect(screen.getByText("10 seconds")).toBeInTheDocument();
  });

  it("renders the forward badge against the right edge", () => {
    const { container } = render(<NetflixSeekHUD direction="forward" metrics={DESKTOP} seconds={10} />);
    const badge = container.firstElementChild;
    expect(badge.style.right).toBe(`${DESKTOP.seekInset}px`);
    expect(badge.style.left).toBe("");
  });

  it("moves with the frame instead of a fixed offset", () => {
    const wide = render(<NetflixSeekHUD direction="back" metrics={DESKTOP} seconds={10} />);
    const narrow = render(<NetflixSeekHUD direction="back" metrics={PHONE} seconds={10} />);
    expect(wide.container.firstElementChild.style.left).not.toBe(narrow.container.firstElementChild.style.left);
    expect(wide.container.firstElementChild.style.top).not.toBe(narrow.container.firstElementChild.style.top);
  });

  it("stays decorative and click-through", () => {
    const { container } = render(<NetflixSeekHUD direction="forward" metrics={DESKTOP} seconds={5} />);
    const badge = container.firstElementChild;
    expect(badge.style.pointerEvents).toBe("none");
    expect(badge.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("5 seconds")).toBeInTheDocument();
  });
});

describe("HUD pills anchor to the measured frame", () => {
  it("volume pill uses the container top and shows the percentage", () => {
    const { container } = render(<NetflixVolumeHUD effVolume={0.4} isMuted={false} metrics={TALL} volume={0.4} />);
    const overlay = container.firstElementChild;
    expect(overlay.style.paddingTop).toBe(`${TALL.top}px`);
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("brightness pill uses the container top", () => {
    const { container } = render(<NetflixBrightnessHUD brightness={1.2} metrics={PHONE} />);
    expect(container.firstElementChild.style.paddingTop).toBe(`${PHONE.top}px`);
    expect(screen.getByText("120%")).toBeInTheDocument();
  });

  it("aspect pill uses the container top and scales its glyph", () => {
    const { container } = render(<NetflixAspectHUD aspectRatioIndex={3} metrics={TALL} />);
    expect(container.firstElementChild.style.paddingTop).toBe(`${TALL.top}px`);
    expect(screen.getByText(/Cinema/)).toBeInTheDocument();
  });
});
