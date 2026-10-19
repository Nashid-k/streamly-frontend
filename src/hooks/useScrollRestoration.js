import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const MAX_SCROLL_ENTRIES = 20;

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
  } catch {}
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
        const deadline = Date.now() + 1200;
        let retryTimer = 0;

        // Pages that grow on scroll (HomePage appends categories per scroll
        // event) are still shorter than the saved offset when the first
        // scrollTo runs, so the browser clamps. Keep re-attempting every 100ms
        // until window.scrollY holds at the target or the deadline passes;
        // cleanup (unmount / navigation / a later restore) cancels the loop.
        const attempt = () => {
          window.scrollTo(0, scrollY);
          if (Math.abs(window.scrollY - scrollY) >= 1 && Date.now() < deadline) {
            retryTimer = window.setTimeout(attempt, 100);
          }
        };
        attempt();
        return () => window.clearTimeout(retryTimer);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.key, navType]);
}
