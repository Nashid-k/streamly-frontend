/**
 * Cooperative body scroll lock (task.md 5.24).
 *
 * Six overlays used to lock the page independently — each saved
 * `document.body.style.overflow`, wrote `"hidden"`, and restored its own saved
 * value on close. That composes only in the simplest case. Open a modal, then
 * the player on top: the player saved `"hidden"` (the modal's lock), and on
 * close put `"hidden"` back — fine. But close them in the other order and the
 * modal restores `""`, unlocking the page underneath a still-open player. The
 * two owners never know about each other.
 *
 * This is the single owner they share: the page is locked while AT LEAST ONE
 * caller holds a lock, and the original inline value is restored only when the
 * LAST one releases. `lockScroll()` returns its own idempotent release
 * function, so an effect can just `return lockScroll()`.
 *
 * The count (not a Set) is enough because each lock owns a distinct release
 * closure; releasing twice is a no-op, and a lock created but never released
 * cannot corrupt another's release.
 */
let activeLocks = 0;
let previousOverflow = "";

export function lockScroll() {
  if (typeof document === "undefined" || !document.body) return () => {};
  if (activeLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  activeLocks += 1;

  let released = false;
  return function releaseScrollLock() {
    if (released) return;
    released = true;
    activeLocks = Math.max(0, activeLocks - 1);
    if (activeLocks === 0) {
      document.body.style.overflow = previousOverflow;
      previousOverflow = "";
    }
  };
}
