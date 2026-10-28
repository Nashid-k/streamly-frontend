import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { logDebug } from "../utils/debugLogger";

const MAX_SCROLL_ENTRIES = 20;
// Back arrives as POP while the previous page is still animating out. The
// restore's first attempt waits for that to settle instead of adjusting the
// scroll mid-flight; the hard cap keeps a missed animation callback from ever
// stranding the viewer away from their position.
const SETTLE_POLL_MS = 50;
const SETTLE_MAX_WAIT_MS = 1000;

function readScrollEntry(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry && Number.isFinite(entry.y)) return entry;
    // Preserve positions saved by versions that stored a plain number.
    const y = Number.parseInt(raw, 10);
    return Number.isFinite(y) ? { y, savedAt: 0 } : null;
  } catch {
    return null;
  }
}

/**
 * Clean up old scroll entries to prevent sessionStorage from growing
 * indefinitely. Keeps only the most recent MAX_SCROLL_ENTRIES entries.
 */
function pruneScrollEntries(currentKey) {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('scroll-')) keys.push(k);
    }
    if (keys.length > MAX_SCROLL_ENTRIES) {
      // Sort by actual save time. Scroll position says nothing about recency.
      keys.sort((a, b) => (readScrollEntry(a)?.savedAt || 0) - (readScrollEntry(b)?.savedAt || 0));
      // Remove oldest entries, but always keep the current page's entry
      const toRemove = keys.slice(0, keys.length - MAX_SCROLL_ENTRIES);
      for (const k of toRemove) {
        if (k !== `scroll-${currentKey}`) {
          sessionStorage.removeItem(k);
        }
      }
    }
  } catch (error) {
    // Session storage is optional: a blocked store must never break paging,
    // but a silent failure here looks like "scroll restore randomly stopped".
    logDebug("scroll", "Could not prune saved scroll entries.", { message: error?.message });
  }
}

export function useScrollRestoration() {
  const location = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    let scrollTimer = null;
    const savePosition = () => {
      try {
        sessionStorage.setItem(
          `scroll-${location.key}`,
          JSON.stringify({ y: window.scrollY, savedAt: Date.now() }),
        );
      } catch {
        // Storage can be disabled; navigation should still work normally.
      }
    };

    const handleScroll = () => {
      // Debounce sessionStorage writes to avoid thrashing on fast scroll
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        savePosition();
      }, 150);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      // Flush a save still inside its debounce window: cleanup runs after the
      // route change but before any scrollTo, so window.scrollY is still the
      // position on the page being left — dropping it made Back land on top.
      if (scrollTimer) {
        clearTimeout(scrollTimer);
        scrollTimer = null;
        savePosition();
      }
      // Prune old entries when leaving a page
      pruneScrollEntries(location.key);
    };
  }, [location.key]);

  useEffect(() => {
    if (navType === "POP") {
      const savedPosition = readScrollEntry(`scroll-${location.key}`);
      if (savedPosition) {
        const scrollY = savedPosition.y;
        const retryDeadline = Date.now() + 1400;
        let settleTimer = 0;
        let retryTimer = 0;

        const attempt = () => {
          // "instant", not "auto": per CSSOM View, "auto" defers to the CSS
          // `scroll-behavior` of the scrolled box, so a stray `smooth` on
          // <html> would turn this restore into a visible glide. Restoring a
          // position must land in one frame.
          window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
          // Re-attempt while the target does not "stick": the destination page
          // grows as its data lands (e.g. HomePage's category count per scroll
          // event), clamping the scroll short of the saved position.
          if (Math.abs(window.scrollY - scrollY) >= 1 && Date.now() < retryDeadline) {
            retryTimer = window.setTimeout(attempt, 80);
          }
        };

        // Layout flips `window.__streamlyRouteAnimating` on route-transition
        // start/complete; wait for it to clear (bounded) so the first attempt
        // lands after the enter animation instead of mid-flight.
        const settleDeadline = Date.now() + SETTLE_MAX_WAIT_MS;
        const pollSettled = () => {
          if (window.__streamlyRouteAnimating !== true || Date.now() >= settleDeadline) {
            requestAnimationFrame(() => {
              requestAnimationFrame(attempt);
            });
            return;
          }
          settleTimer = window.setTimeout(pollSettled, SETTLE_POLL_MS);
        };
        pollSettled();

        return () => {
          window.clearTimeout(settleTimer);
          window.clearTimeout(retryTimer);
        };
      }
    } else {
      // PUSH: the reset must fire at commit, NOT after the animation. Under
      // AnimatePresence mode="popLayout" the document at commit is already the
      // entering page (the exiting one is out of flow), so this lands on the
      // new page invisibly; gating it on the animation flag would let the
      // viewer stare at a mid-page position for the length of the fade when
      // the destination is cached and already tall.
      requestAnimationFrame(() => {
        // "instant", not "auto": "auto" defers to the CSS `scroll-behavior`
        // of the scroll box, so `html { scroll-behavior: smooth }` used to
        // animate this reset — the reported "details page scrolls up from the
        // bottom on every navigation". An unconditional jump, by definition,
        // must not animate.
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      });
    }
  }, [location.key, navType]);
}
