/* ── Player UI shared definitions ────────────────────────────────────────
   Single source of truth for the fixed Netflix-style player chrome
   (black + #E50914): playback-speed ladder, aspect-ratio catalog +
   glyphs, and shared spring tokens. Leaves under src/components/player/
   and CustomVideoPlayer all import from here. */

export const PLAYER_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const ASPECT_RATIOS = [
  { id: "fit", name: "Fit (Original 16:9)", scale: 1 },
  { id: "fill", name: "Fill Screen (Edge-to-Edge)", scale: 1.25 },
  { id: "zoom", name: "Zoom 1.25x (Punch-Hole Cutout)", scale: 1.25 },
  { id: "cinema", name: "Cinema 2.39:1", scale: 1.344 },
  { id: "crop1610", name: "16:10", scale: 1.111 },
  { id: "stretch", name: "Stretch to Screen", scale: 1 },
];

/* How the video surface renders a catalog mode. `objectFit` alone is a no-op
   whenever the player box's ratio already matches the stream's (16:9 stream in
   a ~16:9 window — the common case), so the zoomier modes also punch the video
   in with a transform scale; `contain`-style modes reset it to 1. Fill/Stretch
   intentionally share an appearance (filling the box IS stretching to it),
   while Zoom/Cinema/16:10 crop or letterbox around the same punch-in. */
export const ASPECT_VIDEO_STYLE = {
  fit: { objectFit: "contain", scale: 1 },
  fill: { objectFit: "cover", scale: 1 },
  zoom: { objectFit: "contain", scale: 1.25 },
  cinema: { objectFit: "contain", scale: 1.344 },
  crop1610: { objectFit: "contain", scale: 1.111 },
  stretch: { objectFit: "fill", scale: 1 },
};

/* Style object for the <video> at a catalog index: object-fit plus the punch-in
   scale the mode needs to actually look different. Safe for any index (falls
   back to Fit) so a stale localStorage value can never crash the player. */
export const aspectVideoStyle = (aspectRatioIndex) => {
  const mode = ASPECT_RATIOS[aspectRatioIndex] || ASPECT_RATIOS[0];
  const style = ASPECT_VIDEO_STYLE[mode.id] || ASPECT_VIDEO_STYLE.fit;
  return style.scale === 1
    ? { objectFit: style.objectFit }
    : { objectFit: style.objectFit, transform: `scale(${style.scale})` };
};

export const AR_GLYPH = [
  [44, 25],
  [52, 23],
  [48, 25],
  [50, 21],
  [42, 25],
  [46, 25],
];

export const SPRING_SNAPPY = { type: "spring", stiffness: 500, damping: 28 };

const clamp = (lo, value, hi) => (value < lo ? lo : value > hi ? hi : value);

/* Short edge that renders at 1x. A 1280x720 and a 720x1280 player both scale
   identically, so a portrait phone and a 4K panel read the same. */
export const HUD_REFERENCE_EDGE = 720;

/* Geometry for the transient HUDs (volume / brightness / aspect / seek), derived
   from the measured player box rather than a magic number.

   The player is not the window: a phone-width player inside a desktop window
   makes `vw` clamps size the HUD for the window, and a fixed `top` percentage
   lands the pill mid-frame on one screen size and off the top edge on the next.
   `useContainerSize` measures the frame and every HUD reads these numbers, so
   the overlay tracks the video instead of the viewport. */
export const hudMetrics = (width, height) => {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  // Before the first ResizeObserver tick there is no box to measure; fall back
  // to the reference so the HUD renders at a sane size instead of collapsing.
  const basis = Math.min(w || HUD_REFERENCE_EDGE, h || HUD_REFERENCE_EDGE);
  const frameW = w || HUD_REFERENCE_EDGE;
  const frameH = h || HUD_REFERENCE_EDGE;
  // Sub-linear: a 720p window is 1x, but a 1080p or 4K frame should only read
  // slightly larger. Linear scaling would balloon the pill to 1.5x at 1080p.
  const scale = clamp(0.62, Math.sqrt(basis / HUD_REFERENCE_EDGE), 1.5);
  return {
    width: w,
    height: h,
    scale,
    // Top-anchored band, clear of the back-button row. The upper clamp stops a
    // very tall frame from stranding the pill in the middle of the picture.
    top: Math.round(clamp(14, frameH * 0.13, 104)),
    // Rewind/forward badges hug their own edge, a little above centre.
    seekInset: Math.round(clamp(16, frameW * 0.06, 88)),
    seekCenter: Math.round(frameH * 0.42),
    seekDiameter: Math.round(clamp(56, 84 * scale, 124)),
    seekIcon: Math.round(clamp(20, 30 * scale, 44)),
    seekFont: Math.round(clamp(10, 13 * scale, 17)),
    // Pill (volume / brightness) internals.
    pillGap: Math.round(clamp(8, 12 * scale, 18)),
    pillPadY: Math.round(clamp(8, 13 * scale, 20)),
    pillPadX: Math.round(clamp(12, 20 * scale, 30)),
    pillRadius: Math.round(clamp(6, 8 * scale, 12)),
    pillIcon: Math.round(clamp(16, 20 * scale, 30)),
    barWidth: Math.round(clamp(72, 120 * scale, 170)),
    barHeight: Math.round(clamp(3, 5 * scale, 7)),
    valueFont: Math.round(clamp(11, 15 * scale, 22)),
    valueMinWidth: Math.round(clamp(30, 44 * scale, 62)),
    // Aspect card: AR_GLYPH is authored against 720px, so it scales as a unit.
    glyphScale: scale,
    labelGap: Math.round(clamp(6, 10 * scale, 14)),
    labelFont: Math.round(clamp(11, 14 * scale, 20)),
  };
};