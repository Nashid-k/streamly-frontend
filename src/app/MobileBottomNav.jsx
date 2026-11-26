import { useRef, useEffect, useState, useCallback, useLayoutEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { NAV_ITEMS } from "../constants/navigation";
import { useI18n } from "../i18n/index.jsx";
import { usePreferenceValue } from "../context/preferences";
import { DURATION_2 } from "../constants/motion";

const NAV_DURATION_MS = DURATION_2.NAV * 1000;
const WAVE_STAGGER_MS = 55;
const SCROLL_COMPACT_AT = 60;
const PILL_SETTLE_MS = NAV_DURATION_MS + 40;

/* Canonical 2.0 bottom pill (`#tb` in streamly_2.0.html): four frozen
   NAV_ITEMS at every width, one shared `#pill` gliding under them, the
   `navwave`/sheen choreography at --dur-nav/--stagger, and `.sc` compaction
   after the first scroll. Reduced motion paints every state instantly. */
function MobileBottomNav() {
  const location = useLocation();
  const { t } = useI18n();
  const osReducedMotion = useReducedMotion();
  const prefReduceMotion = usePreferenceValue("reduceMotion", false);
  const reduceMotion = osReducedMotion || !!prefReduceMotion;

  const navRef = useRef(null);
  const lastActiveIndexRef = useRef(-1);
  const pillTimerRef = useRef(0);
  const waveTimerRef = useRef(0);
  const [compact, setCompact] = useState(false);

  const endPillGlide = useCallback(() => {
    if (pillTimerRef.current) {
      window.clearTimeout(pillTimerRef.current);
      pillTimerRef.current = 0;
    }
    navRef.current?.removeAttribute("data-pill-moving");
  }, []);

  const runNavWave = useCallback((fromIndex, toIndex) => {
    const nav = navRef.current;
    if (!nav) return;
    const links = nav.querySelectorAll("a[data-v]");
    if (!links.length) return;

    const direction = toIndex >= fromIndex ? "go" : "back";
    nav.classList.remove("go", "back");
    // Restart both the nav sheen and the link waves even on a rapid tap.
    void nav.offsetWidth;
    nav.classList.add(direction);

    links.forEach((link, index) => {
      link.classList.remove("wave");
      if (index !== fromIndex && index !== toIndex && Math.abs(index - toIndex) !== 1) return;
      link.style.setProperty(
        "--wave-delay",
        `${Math.abs(index - fromIndex) * WAVE_STAGGER_MS}ms`,
      );
    });
    // Reading offsetWidth once restarts every pending wave at the same frame.
    void nav.offsetWidth;
    links.forEach((link, index) => {
      if (index !== fromIndex && index !== toIndex && Math.abs(index - toIndex) !== 1) return;
      link.classList.add("wave");
      link.addEventListener("animationend", () => link.classList.remove("wave"), {
        once: true,
      });
    });

    if (waveTimerRef.current) window.clearTimeout(waveTimerRef.current);
    waveTimerRef.current = window.setTimeout(() => {
      waveTimerRef.current = 0;
      nav.classList.remove("go", "back");
    }, NAV_DURATION_MS + 80);
  }, []);

  const measurePill = useCallback(
    (animate = false) => {
      const nav = navRef.current;
      if (!nav) return;
      const active = nav.querySelector('[aria-current="page"]');
      nav.toggleAttribute("data-has-active", Boolean(active));
      if (!active) {
        lastActiveIndexRef.current = -1;
        return;
      }

      const activeIndex = NAV_ITEMS.findIndex((item) => item.id === active.dataset.v);
      const previousIndex = lastActiveIndexRef.current;
      const moved = animate && previousIndex >= 0 && previousIndex !== activeIndex;

      if (moved && !reduceMotion) {
        nav.setAttribute("data-pill-moving", "true");
        // Flush the old geometry so the browser has a real starting point.
        void nav.offsetWidth;
        if (pillTimerRef.current) window.clearTimeout(pillTimerRef.current);
        pillTimerRef.current = window.setTimeout(endPillGlide, PILL_SETTLE_MS);
      } else if (!nav.hasAttribute("data-pill-moving") || !active) {
        // The follow-up rAF/compact/resize measures must not cancel the glide
        // that the route-change measure just started.
        endPillGlide();
      }

      /* offsetLeft/offsetWidth are layout values, so the pill still matches the
         active link while the nav's `tbin` entrance is scaling the whole bar.
         getBoundingClientRect() would measure that 0.9 scale and leave the pill
         permanently 10% narrower than its target. */
      if (active.offsetWidth > 0) {
        nav.style.setProperty("--pill-x", `${active.offsetLeft}px`);
        nav.style.setProperty("--pill-w", `${active.offsetWidth}px`);
      }

      lastActiveIndexRef.current = activeIndex;
      if (moved && !reduceMotion) runNavWave(previousIndex, activeIndex);
    },
    [endPillGlide, reduceMotion, runNavWave],
  );

  useLayoutEffect(() => {
    measurePill(true);
    // A second synchronous settle catches late font/avatar geometry changes
    // without letting a resize glide the pill.
    const frame = window.requestAnimationFrame(() => measurePill(false));
    return () => window.cancelAnimationFrame(frame);
  }, [measurePill, location.pathname]);

  useLayoutEffect(() => {
    measurePill(false);
  }, [compact, measurePill]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const handleTransitionEnd = (event) => {
      if (event.target === nav.querySelector("#pill") && event.propertyName === "transform") {
        endPillGlide();
      }
    };
    nav.addEventListener("transitionend", handleTransitionEnd);
    return () => nav.removeEventListener("transitionend", handleTransitionEnd);
  }, [endPillGlide]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let frameId = 0;
    const handleScroll = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        const nextCompact = window.scrollY > SCROLL_COMPACT_AT;
        setCompact((current) => (current === nextCompact ? current : nextCompact));
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let frameId = 0;
    let disposed = false;
    const relayout = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        measurePill(false);
      });
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(relayout);
    observer?.observe(nav);
    window.addEventListener("resize", relayout);
    document.fonts?.ready.then(() => {
      if (!disposed) relayout();
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", relayout);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [measurePill]);

  useEffect(
    () => () => {
      if (pillTimerRef.current) window.clearTimeout(pillTimerRef.current);
      if (waveTimerRef.current) window.clearTimeout(waveTimerRef.current);
    },
    [],
  );

  return (
    <nav
      id="tb"
      ref={navRef}
      className={`tb glass mobile-bottom-nav${compact ? " sc" : ""}`}
      aria-label={t("nav.mobileNav")}
    >
      <span id="pill" aria-hidden="true" />
      {NAV_ITEMS.map((item) => {
        const active = item.match(location.pathname);
        const label = t(`nav.${item.id}`);
        return (
          <Link
            key={item.id}
            to={item.to}
            data-v={item.id}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            title={label}
          >
            <item.icon size={20} strokeWidth={2} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default MobileBottomNav;
