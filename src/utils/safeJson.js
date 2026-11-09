// src/utils/safeJson.js — single JSON.parse-with-fallback helper so the
// "parse or fall back" idiom has one owner.
export function safeParse(raw, fallback = null) {
  if (raw === null || raw === undefined) return fallback;
  try {
    const v = JSON.parse(raw);
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}
