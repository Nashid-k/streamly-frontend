/* Measures the generated icons instead of trusting them.
 *
 * WHY: an icon is the one asset nobody can review in a diff, and "looks fine" is
 * not a check. This decodes every PNG the generator wrote and asserts the things
 * that actually go wrong in practice - a glyph that runs into the adaptive safe
 * zone, a transparent adaptive foreground that got an opaque plate, a triangle
 * that came out lopsided, a launcher plate cropped by its own rounded corners, a
 * contrast so low the glyph disappears against the plate.
 *
 * Run: node scripts/verify-app-icons.mjs                                      */

import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE = join(dirname(fileURLToPath(import.meta.url)), "..", "mobile");

/* The generator writes filter 0 on every scanline, so decoding is a straight
 * inflate - which is also a check that nothing but filter 0 is in there. */
function decodePng(absPath) {
  const png = readFileSync(absPath);
  const size = png.readUInt32BE(16);
  const colourType = png[25];
  if (colourType !== 6) throw new Error(`${absPath}: expected RGBA, got colour type ${colourType}`);
  const idat = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = 1 + size * 4;
  if (raw.length !== stride * size) throw new Error(`${absPath}: raw size mismatch`);
  for (let y = 0; y < size; y += 1) {
    if (raw[y * stride] !== 0) throw new Error(`${absPath}: scanline ${y} is not filter 0`);
  }
  const px = (x, y) => {
    const i = y * stride + 1 + x * 4;
    return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]];
  };
  return { size, px };
}

function measure(absPath) {
  const { size, px } = decodePng(absPath);
  const box = () => ({ minX: size, minY: size, maxX: -1, maxY: -1 });
  const grow = (b, x, y) => {
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
  };
  const opaqueBox = box();
  const faintBox = box();
  let opaque = 0;
  /* Partial coverage: every pixel the rasteriser did not resolve to fully on or
   * fully off. No lower bound - a 16%-alpha glow band is anti-aliased output too,
   * and a previous version of this check skipped it by requiring a > 128. */
  let partial = 0;
  const partialLevels = new Set();
  let faint = 0;
  let plateLuma = 0;
  let plateCount = 0;
  let glyphLuma = 0;
  let glyphCount = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = px(x, y);
      if (a > 250) {
        opaque += 1;
        grow(opaqueBox, x, y);
      }
      if (a > 0 && a < 250) {
        partial += 1;
        partialLevels.add(Math.round(a / 16));
      }
      if (a >= 8 && a < 200) {
        faint += 1;
        grow(faintBox, x, y);
      }
      if (a < 16) continue;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      /* "Glyph" = markedly brighter than the plate; the plate is a deep red ramp. */
      if (luma > 170) {
        glyphLuma += luma;
        glyphCount += 1;
      } else {
        plateLuma += luma;
        plateCount += 1;
      }
    }
  }
  const total = size * size;
  return {
    size,
    opaqueFraction: opaque / total,
    box: opaqueBox,
    faintBox,
    faintFraction: faint / total,
    partialFraction: partial / total,
    partialLevels: partialLevels.size,
    plateLuma: plateCount ? plateLuma / plateCount : 0,
    glyphLuma: glyphCount ? glyphLuma / glyphCount : 0,
    glyphFraction: glyphCount / total,
  };
}

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(58)} ${detail}`);
}

/* Which way does the mark point? A right-pointing triangle carries most of its
 * area behind the tip, so its centroid sits LEFT of its bounding-box centre; a
 * left-pointing one is the mirror. Measuring the centroid separates the two
 * cases that a "is it a triangle" check happily passes. */
function glyphCentroid(absPath) {
  const { size, px } = decodePng(absPath);
  let sum = 0;
  let weighted = 0;
  let minX = size;
  let maxX = -1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = px(x, y);
      if (a <= 128) continue;
      if (0.2126 * r + 0.7152 * g + 0.0722 * b <= 170) continue;
      sum += 1;
      weighted += x;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (!sum) return null;
  const boxCentre = (minX + maxX) / 2;
  return { centroidX: weighted / sum, boxCentre, minX, maxX, pixels: sum };
}

console.log("=== legacy launcher plate (assets/icon.png, 1024)");
const icon = measure(join(MOBILE, "assets/icon.png"));
check("size is 1024x1024", icon.size === 1024, `${icon.size}px`);
/* A 0.225-radius rounded square leaves (4-π)r² ≈ 4.4% of the corners transparent,
 * so "almost fully opaque" is the correct outcome, not a failure. */
check("plate fills the frame apart from its rounded corners", icon.opaqueFraction > 0.93 && icon.opaqueFraction < 0.99, `${(icon.opaqueFraction * 100).toFixed(1)}% opaque`);
check(
  "plate is centred and fills the frame",
  icon.box.minX <= 2 && icon.box.minY <= 2 && icon.box.maxX >= icon.size - 3 && icon.box.maxY >= icon.size - 3,
  `box ${icon.box.minX},${icon.box.minY} → ${icon.box.maxX},${icon.box.maxY}`,
);
check("glyph is present and a sensible share of the plate", icon.glyphFraction > 0.12 && icon.glyphFraction < 0.32, `${(icon.glyphFraction * 100).toFixed(1)}% of pixels`);
check("glyph is much brighter than the plate", icon.glyphLuma - icon.plateLuma > 90, `glyph ${icon.glyphLuma.toFixed(0)} vs plate ${icon.plateLuma.toFixed(0)} luma`);
check(
  "glyph edge is smoothly anti-aliased, not stair-stepped",
  icon.partialLevels >= 4 && icon.partialFraction > 0.0005,
  `${icon.partialLevels} coverage levels over ${(icon.partialFraction * 100).toFixed(2)}% of pixels`,
);

console.log("\n=== adaptive foreground (assets/adaptive-icon.png, 1024)");
const adaptive = measure(join(MOBILE, "assets/adaptive-icon.png"));
const adaptivePath = join(MOBILE, "assets/adaptive-icon.png");
const safe = adaptive.size * 0.165; // 66% safe zone → 17% margin per side
check("size is 1024x1024", adaptive.size === 1024, `${adaptive.size}px`);
check("background is transparent (a mask supplies the plate)", adaptive.opaqueFraction < 0.2, `${(adaptive.opaqueFraction * 100).toFixed(1)}% opaque`);
check(
  `glyph stays inside the 66% safe zone (${Math.round(safe)}px margin)`,
  adaptive.box.minX >= safe && adaptive.box.minY >= safe && adaptive.box.maxX <= adaptive.size - safe && adaptive.box.maxY <= adaptive.size - safe,
  `box ${adaptive.box.minX},${adaptive.box.minY} → ${adaptive.box.maxX},${adaptive.box.maxY}`,
);
check(
  "glyph is horizontally centred (a play mark must not look off-axis)",
  Math.abs((adaptive.box.minX + adaptive.box.maxX) / 2 - adaptive.size / 2) < adaptive.size * 0.02,
  `centre offset ${(((adaptive.box.minX + adaptive.box.maxX) / 2) - adaptive.size / 2).toFixed(1)}px`,
);
check(
  "glyph is vertically centred",
  Math.abs((adaptive.box.minY + adaptive.box.maxY) / 2 - adaptive.size / 2) < adaptive.size * 0.02,
  `centre offset ${(((adaptive.box.minY + adaptive.box.maxY) / 2) - adaptive.size / 2).toFixed(1)}px`,
);
check(
  "glyph is wider than tall (a play triangle, not a blob)",
  (adaptive.box.maxX - adaptive.box.minX) / (adaptive.box.maxY - adaptive.box.minY) > 1.05,
  `aspect ${((adaptive.box.maxX - adaptive.box.minX) / (adaptive.box.maxY - adaptive.box.minY)).toFixed(2)}`,
);
/* A glow is only a glow if it surrounds the mark, so this compares the faint
 * pixels' bounding box against the opaque glyph's - a haze clipped to one side,
 * or a glow painted *under* an opaque plate, fails here. */
check(
  "glow forms a soft band around the glyph",
  adaptive.faintFraction > 0.01 &&
    adaptive.faintBox.minX < adaptive.box.minX &&
    adaptive.faintBox.minY < adaptive.box.minY &&
    adaptive.faintBox.maxX > adaptive.box.maxX &&
    adaptive.faintBox.maxY > adaptive.box.maxY,
  `faint ${(adaptive.faintFraction * 100).toFixed(1)}% of canvas, band ${adaptive.faintBox.minX},${adaptive.faintBox.minY} → ${adaptive.faintBox.maxX},${adaptive.faintBox.maxY} vs glyph ${adaptive.box.minX},${adaptive.box.minY} → ${adaptive.box.maxX},${adaptive.box.maxY}`,
);
check(
  "glow is smooth, not a hard cut-out",
  adaptive.partialLevels >= 6,
  `${adaptive.partialLevels} coverage levels`,
);

console.log("\n=== the play mark points right");
for (const [label, path] of [
  ["adaptive foreground", adaptivePath],
  ["legacy plate", join(MOBILE, "assets/icon.png")],
  ["splash glyph", join(MOBILE, "assets/splash-icon.png")],
  ["xxxhdpi plate", join(MOBILE, "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png")],
  ["mdpi plate", join(MOBILE, "android/app/src/main/res/mipmap-mdpi/ic_launcher.png")],
]) {
  const c = glyphCentroid(path);
  const skew = c ? c.centroidX - c.boxCentre : 0;
  const width = c ? c.maxX - c.minX : 0;
  check(
    `${label}: mass sits behind the tip (points right)`,
    Boolean(c) && width > 8 && skew < -width * 0.08,
    c ? `centroid ${skew.toFixed(1)}px left of box centre, glyph ${width}px wide` : "no glyph found",
  );
}

console.log("\n=== every launcher density decodes and carries the glyph");
for (const [density, expected] of [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
]) {
  for (const name of ["ic_launcher", "ic_launcher_round"]) {
    const m = measure(join(MOBILE, `android/app/src/main/res/mipmap-${density}/${name}.png`));
    check(
      `mipmap-${density}/${name}.png`,
      m.size === expected && m.glyphFraction > 0.02 && m.glyphLuma - m.plateLuma > 70,
      `${m.size}px, glyph ${(m.glyphFraction * 100).toFixed(1)}%, contrast +${(m.glyphLuma - m.plateLuma).toFixed(0)}`,
    );
  }
  const fg = measure(join(MOBILE, `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`));
  const fgSize = Math.round(expected * 2.25);
  check(
    `mipmap-${density}/ic_launcher_foreground.png`,
    fg.size === fgSize && fg.glyphFraction > 0.01,
    `${fg.size}px (expected ${fgSize}), glyph ${(fg.glyphFraction * 100).toFixed(1)}%`,
  );
}

console.log("\n=== round icon is actually round, legacy is a squircle");
/* Both shapes are inscribed in the canvas, so the edge midpoints are opaque in
 * both and cannot tell them apart. The diagonal is the discriminator: a circle
 * falls away from it, a rounded square does not. */
const diagonal = (absPath) => {
  const { size, px } = decodePng(absPath);
  const at = (f) => px(Math.floor(f * size), Math.floor(f * size))[3];
  return { near: at(0.08), mid: at(0.5) };
};

const roundDiag = diagonal(join(MOBILE, "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png"));
const squircleDiag = diagonal(join(MOBILE, "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"));
check("round variant is filled through its centre", roundDiag.mid > 250, `alpha ${roundDiag.mid}`);
check("round variant falls away on the diagonal (a true circle)", roundDiag.near < 60, `alpha ${roundDiag.near} at 8% in`);
check("squircle stays filled on the diagonal", squircleDiag.near > 200, `alpha ${squircleDiag.near} at 8% in`);
check(
  "round and squircle really are different artwork",
  roundDiag.near < 60 && squircleDiag.near > 200,
  `round ${roundDiag.near} vs squircle ${squircleDiag.near}`,
);

console.log(`\n${failures === 0 ? "ALL ICON CHECKS PASSED" : `${failures} ICON CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
