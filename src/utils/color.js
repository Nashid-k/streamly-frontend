// src/utils/color.js — shared hex colour helpers. Consolidates the two
// hand-rolled copies that used to live in PreferencesContext and
// usePlayerV4Appearance so malformed input is handled one way everywhere.

export function hexToRgbTriplet(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function deriveSecondary(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!match) return "#3f8a1d";
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const d = (v) => Math.round(v * 0.6);
  return `#${[d(r), d(g), d(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
