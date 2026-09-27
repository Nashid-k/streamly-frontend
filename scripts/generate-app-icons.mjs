/* Generates every launcher icon and splash glyph from one vector description.
 *
 * WHY A SCRIPT AND NOT A PNG. The old icon was Expo's prebuild default, which is
 * the reason it looked like a template. A hand-drawn icon cannot be reviewed,
 * diffed or re-derived from a 48px bitmap, so the artwork lives here as geometry
 * and this renders every density from it. Change a colour or a radius, re-run, and
 * the master, the five legacy mipmaps, the adaptive foreground, the splash and the
 * favicon all move together.
 *
 * There is no image library in this repo (and adding one to draw six gradients is
 * not a trade worth making), so this is a small supersampled software rasteriser
 * plus a PNG encoder on top of node:zlib. Shapes are signed-distance functions, so
 * edges are analytically anti-aliased instead of blocky.
 *
 * Run: node scripts/generate-app-icons.mjs                                     */

import { deflateSync } from "node:zlib";
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, "..", "mobile");

/* ── canvas ──────────────────────────────────────────────────────────────── */

class Canvas {
  constructor(size) {
    this.size = size;
    this.px = new Float64Array(size * size * 4); // premultiplied-free straight RGBA
  }

  /* Source-over compositing of one pixel. */
  blend(x, y, [r, g, b], a) {
    if (a <= 0) return;
    const i = (y * this.size + x) * 4;
    const dst = this.px[i + 3];
    const out = a + dst * (1 - a);
    if (out <= 0) return;
    this.px[i] = (r * a + this.px[i] * dst * (1 - a)) / out;
    this.px[i + 1] = (g * a + this.px[i + 1] * dst * (1 - a)) / out;
    this.px[i + 2] = (b * a + this.px[i + 2] * dst * (1 - a)) / out;
    this.px[i + 3] = out;
  }

  /* Fills every pixel whose SDF is inside the shape, 4x4 supersampled.
   * Shapes and colour ramps are all authored in a 0..1 unit square so the artwork
   * is resolution independent; this is the one place that converts to pixels. */
  fill(sdf, colorAt, alpha = 1) {
    const s = this.size;
    for (let y = 0; y < s; y += 1) {
      for (let x = 0; x < s; x += 1) {
        let hits = 0;
        for (let sy = 0; sy < 4; sy += 1) {
          for (let sx = 0; sx < 4; sx += 1) {
            if (sdf((x + (sx + 0.5) / 4) / s, (y + (sy + 0.5) / 4) / s) <= 0) hits += 1;
          }
        }
        if (!hits) continue;
        const colour = typeof colorAt === "function" ? colorAt((x + 0.5) / s, (y + 0.5) / s) : colorAt;
        this.blend(x, y, colour, (hits / 16) * alpha);
      }
    }
  }
}

/* ── geometry (all in 0..1 unit space, y down) ───────────────────────────── */

const mix = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const mixColour = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* Rounded rectangle centred in the unit square. */
const roundedRect = (radius) => (x, y) => {
  const dx = Math.abs(x - 0.5) - (0.5 - radius);
  const dy = Math.abs(y - 0.5) - (0.5 - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
};

const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

/* Exact signed distance to a convex polygon (max of the edge planes inside, min
 * distance to the segments outside), then dilated by the corner radius. A play
 * glyph is the one shape where an approximation shows: a spike or a dented edge is
 * instantly visible at 48px, so this is computed rather than eyeballed. */
function roundedPolygon(points, round) {
  const edges = points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    /* Outward normal for a clockwise-wound polygon in a y-down space. */
    return { a, b, nx: ey / len, ny: -ex / len, len };
  });

  const segmentDistance = (px, py, e) => {
    const vx = e.b[0] - e.a[0];
    const vy = e.b[1] - e.a[1];
    const t = Math.max(0, Math.min(1, ((px - e.a[0]) * vx + (py - e.a[1]) * vy) / (e.len * e.len)));
    return Math.hypot(px - (e.a[0] + vx * t), py - (e.a[1] + vy * t));
  };

  return (x, y) => {
    let inside = -Infinity;
    for (const e of edges) {
      const d = (x - e.a[0]) * e.nx + (y - e.a[1]) * e.ny;
      if (d > inside) inside = d;
    }
    if (inside <= 0) return inside - round;
    let nearest = Infinity;
    for (const e of edges) {
      const d = segmentDistance(x, y, e);
      if (d < nearest) nearest = d;
    }
    return nearest - round;
  };
}

/* A play triangle pointing right, softly rounded: vertical back edge on the left,
 * tip forward. The vertex order is what makes the edge normals point outward, so
 * it is fixed by test rather than by eye - reversing it renders a left-pointing
 * mark, which still looks like a triangle and is exactly the kind of thing that
 * ships unnoticed. */
const PLAY_K = 0.62;
const playTriangle = (cx, cy, halfW, halfH, round) => {
  const k = PLAY_K;
  const points = [
    [cx - halfW, cy - halfH],
    [cx + halfW * k, cy],
    [cx - halfW, cy + halfH],
  ];
  return roundedPolygon(points, round);
};

/* ── palette ─────────────────────────────────────────────────────────────── */

const CRIMSON = [0xf2, 0x26, 0x3c];
const DEEP = [0x8e, 0x0e, 0x24];
const NIGHT = [0x0a, 0x0a, 0x12];
const WHITE = [0xff, 0xff, 0xff];
const BLUSH = [0xff, 0xd9, 0xdf];

/* Diagonal brand gradient with a broad soft highlight in the upper left, which is
 * what stops a flat two-stop ramp from looking like a CSS demo. Both extras are
 * deliberately wide and shallow: a tight highlight renders as a smudge on the
 * plate once the launcher scales the icon down. */
function brandRamp(x, y) {
  const t = clamp01((x * 0.35 + y * 0.65) / 0.85);
  let colour = mixColour(CRIMSON, DEEP, t * t * 0.92 + t * 0.08);
  const glow = Math.hypot(x - 0.3, y - 0.22);
  colour = mixColour(colour, WHITE, clamp01(0.52 - glow) ** 1.7 * 0.3);
  /* A single wide diagonal light band. */
  const streak = Math.abs(x + y - 0.75);
  colour = mixColour(colour, WHITE, clamp01(0.18 - streak) ** 1.5 * 0.11);
  return colour;
}

function glyphRamp(x, y) {
  const t = clamp01((y - 0.24) / 0.52);
  return mixColour(WHITE, BLUSH, t * 0.55);
}

/* ── the artwork ─────────────────────────────────────────────────────────── */

/* Full-bleed legacy icon: squircle plate + soft shadow + play glyph. */
function drawLegacy(size, { round = false, plate = true } = {}) {
  const c = new Canvas(size);
  if (plate) {
    const radius = round ? 0.5 : 0.225;
    const plateSdf = round ? circle(0.5, 0.5, 0.5) : roundedRect(radius);
    /* Soft drop shadow under the plate, so it does not sit flat on the launcher. */
    c.fill((x, y) => plateSdf(x, y + 0.012) - 0.02, [0, 0, 0], 0.35);
    c.fill(plateSdf, (x, y) => brandRamp(x, y));
    /* Inner top edge highlight. */
    c.fill((x, y) => plateSdf(x, y + 0.006) - 0.004, [0, 0, 0], 0);
  }
  drawGlyph(c, { scale: 0.34, shadow: plate });
  return c;
}

/* Adaptive foreground: the glyph only, inside the 66% safe zone that every
 * launcher mask is guaranteed not to clip. Transparent elsewhere. */
function drawAdaptive(size) {
  const c = new Canvas(size);
  drawGlyph(c, { scale: 0.3, shadow: false, glow: true });
  return c;
}

function drawGlyph(c, { scale, shadow, glow = false }) {
  /* A play triangle is optically centred on its bounding box, not on its
   * geometry: the empty space behind the back edge reads as part of the mark, so
   * centring the apex instead leaves the glyph visibly left of the plate. */
  const halfW = scale;
  const halfH = scale * 0.65; // height:width ≈ 0.8, which is what reads as a play mark
  const cx = 0.5 + (halfW * (1 - PLAY_K)) / 2;
  const cy = 0.5;
  const tri = playTriangle(cx, cy, halfW, halfH, scale * 0.11);
  if (shadow) {
    c.fill((x, y) => tri(x, y + 0.014) - scale * 0.02, [0x40, 0x00, 0x08], 0.4);
  }
  if (glow) {
    /* A glow needs a falloff - one flat band reads as a red outline, and note
     * that growing an SDF means SUBTRACTING from it. These step up in alpha
     * toward the mark, which source-over accumulates into a soft halo. */
    for (const [grow, alpha] of [
      [0.075, 0.05],
      [0.055, 0.07],
      [0.038, 0.1],
      [0.022, 0.14],
    ]) {
      c.fill((x, y) => tri(x, y) - grow, CRIMSON, alpha);
    }
  }
  c.fill(tri, (x, y) => glyphRamp(x, y));
}

/* ── PNG encoding ────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(canvas) {
  const s = canvas.size;
  const byte = (v) => Math.round(Math.max(0, Math.min(255, v)));
  /* One filter byte (0 = None) per scanline, then RGBA8. Colour channels are
   * already 0..255 from the palette; only coverage is 0..1. */
  const raw = Buffer.alloc(s * (1 + s * 4));
  let o = 0;
  for (let y = 0; y < s; y += 1) {
    raw[o] = 0;
    o += 1;
    for (let x = 0; x < s; x += 1) {
      const i = (y * s + x) * 4;
      raw[o] = byte(canvas.px[i]);
      raw[o + 1] = byte(canvas.px[i + 1]);
      raw[o + 2] = byte(canvas.px[i + 2]);
      raw[o + 3] = Math.round(clamp01(canvas.px[i + 3]) * 255);
      o += 4;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0);
  ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* Self-check: a PNG that is subtly malformed installs and then renders as
 * nothing, which is exactly the failure nobody sees until a user reports it. */
function verify(png, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!png.subarray(0, 8).equals(sig)) throw new Error("bad PNG signature");
  if (png.toString("ascii", 12, 16) !== "IHDR") throw new Error("missing IHDR");
  if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) {
    throw new Error(`IHDR says ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}, wanted ${size}`);
  }
  if (png.toString("ascii", png.length - 8, png.length - 4) !== "IEND") throw new Error("missing IEND");
  return true;
}

function write(relPath, canvas) {
  const png = encodePng(canvas);
  verify(png, canvas.size);
  const abs = join(MOBILE, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, png);
  return { relPath, bytes: png.length, size: canvas.size };
}

/* ── outputs ─────────────────────────────────────────────────────────────── */

const written = [];

/* Master + the assets app.json points at. */
written.push(write("assets/icon.png", drawLegacy(1024)));
written.push(write("assets/adaptive-icon.png", drawAdaptive(1024)));
written.push(write("assets/splash-icon.png", drawAdaptive(512)));
written.push(write("assets/favicon.png", drawLegacy(64, { round: true })));

/* Launcher mipmaps. Expo's prebuild wrote .webp here; PNG in the same resource
 * name would be a duplicate-resource build error, so the old files go first. */
const LEGACY = [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
];
const ADAPTIVE = [
  ["mdpi", 108],
  ["hdpi", 162],
  ["xhdpi", 216],
  ["xxhdpi", 324],
  ["xxxhdpi", 432],
];

for (const [density, size] of LEGACY) {
  const dir = join(MOBILE, "android/app/src/main/res", `mipmap-${density}`);
  for (const stale of readdirSync(dir).filter((f) => f.startsWith("ic_launcher") && f.endsWith(".webp"))) {
    unlinkSync(join(dir, stale));
  }
  written.push(write(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`, drawLegacy(size)));
  written.push(
    write(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`, drawLegacy(size, { round: true })),
  );
}

for (const [density, size] of ADAPTIVE) {
  written.push(
    write(`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`, drawAdaptive(size)),
  );
}

const px = (n) => `${n}px`;
for (const w of written) {
  console.log(`  ${w.relPath.padEnd(62)} ${px(w.size).padStart(8)}  ${(w.bytes / 1024).toFixed(1)} KB`);
}
console.log(`\n${written.length} files written.`);
