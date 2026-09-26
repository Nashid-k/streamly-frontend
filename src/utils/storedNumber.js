/* Read a numeric preference back out of localStorage, with a real "unset"
   answer.
   `getItem` returns null for a missing key and `Number(null)` is 0 — NOT NaN —
   so the obvious `Number.isFinite(Number(getItem(k)))` guard passes for a value
   that was never written and clamps to whatever the floor is. That is how the
   player ended up rendering `brightness(0.25)` (and volume 0) for anyone whose
   key was absent, then persisting the floor forever. Missing, blank and
   unparsable all mean "no stored value" here, so the caller gets its fallback
   instead of a fabricated 0. Unavailable storage (private mode, disabled
   cookies) is the same answer, never a throw. */
export function readStoredNumber(key, { min = -Infinity, max = Infinity, fallback = null } = {}, storage) {
  const store = storage || (typeof window !== "undefined" ? window.localStorage : null);
  if (!store) return fallback;
  let value;
  try {
    const raw = store.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const trimmed = String(raw).trim();
    if (trimmed === "") return fallback;
    value = Number(trimmed);
  } catch {
    return fallback;
  }
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
