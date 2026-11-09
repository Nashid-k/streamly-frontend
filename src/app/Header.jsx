import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search, Settings, ChevronLeft } from "lucide-react";
import { NAV_ITEMS } from "../constants/navigation";
import { SPRING, DURATION, EASE_OUT } from "../constants/motion";
import { useI18n } from "../i18n/index.jsx";
import { useAppAuth } from "../context/auth";
import AccountMenu from "./AccountMenu";
import NotificationCenter from "../components/NotificationCenter";
import { logDebug } from "../utils/debugLogger";

/* ── Primary navigation ────────────────────────────────────────────────────
   Two independent floating islands (Cinejoy .header-row): the brand mark hangs
   ALONE at the left end, the desktop-nav glass pill (tabs · divider · icons)
   floats at the right end — no connected navbar bar between them. */
function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAppAuth();
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

    /* ── Settings dropdown (Cinejoy .head-menu) ──────────────────────────────
       Clicking the settings icon drops a menu with Login / Settings / Watch
       History (no Shorts), positioned with fixed coords measured off the button so
       it escapes the pill's overflow/backdrop root. */
  const settingsBtnRef = useRef(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);

  const toggleAccountMenu = useCallback(() => {
    const el = settingsBtnRef.current;
    if (!accountMenuOpen && el) {
      const rect = el.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 10, left: Math.max(8, rect.right - 240) });
    }
    setAccountMenuOpen((open) => !open);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const reposition = () => {
      const el = settingsBtnRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 10, left: Math.max(8, rect.right - 240) });
    };
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [accountMenuOpen]);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let focusFrame = 0;
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Carry the active query over so results, scroll and filters survive.
        navigate({ pathname: "/search", search: location.search });
        // Contract with SearchPage: it listens for this event and focuses its
        // input. Deferred a frame so a /search page that has to mount first is
        // committed (and subscribed) before the event fires.
        if (focusFrame) window.cancelAnimationFrame(focusFrame);
        focusFrame = window.requestAnimationFrame(() => {
          focusFrame = 0;
          window.dispatchEvent(new CustomEvent("streamly:search-focus"));
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
    };
  }, [navigate, location.search]);

  // Scrolled is a boolean, so this effect only re-renders on the 50px — the
  // RIVO progress rail is a CSS scroll timeline (header.css) and React no
  // longer tracks the scroll fraction per frame.
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let frameId = 0;
    const handleScroll = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        const nextIsScrolled = window.scrollY > 50;
        setIsScrolled((current) => (current === nextIsScrolled ? current : nextIsScrolled));
        frameId = 0;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

    /* ── Sliding active pill (Cinejoy .nav-pill) ─────────────────────────────
       One shared highlight glides between whatever nav item is active — brand links
       AND icon buttons on the same track. Position/width come from real DOM
       measurements; the travel itself is a spring so a second click mid-flight
       retargets from the current velocity instead of restarting a curve. */
  const navRef = useRef(null);
  const [pill, setPill] = useState({ x: 0, w: 0, ready: false });
  // The very first placement is a cut: a hard load must not sweep the pill in
  // from x=0 before it has ever been measured.
  const [pillAnimated, setPillAnimated] = useState(false);
  const measureTick = useRef(0);

  /** Epsilon-guarded placement: sub-pixel drift (fractional rects, mid-transition
      reflows) must never retarget the spring — only real geometry moves it. */
  const placePill = useCallback((x, w) => {
    setPill((prev) =>
      prev.ready && Math.abs(prev.x - x) <= 0.5 && Math.abs(prev.w - w) <= 0.5
        ? prev
        : { x, w, ready: true },
    );
  }, []);

  const measurePill = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
        /* Measure against the navbar track with getBoundingClientRect — NOT
           offsetLeft. offsetLeft is relative to each item's nearest positioned
           ancestor, and the icon items (Search/Settings) sit in a different
           positioned cluster than the text links, so their pills would measure from
           another origin and land slid off-track. A rect diff off the shared navbar
           box stays correct for any nested container. */
    const active = nav.querySelector('[data-nav-active="true"]');
    if (!active) {
      // Routes with no active tab (genre/category/person) hide the pill instead
      // of collapsing it to a 0px sliver at the far left of the track.
      setPill((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
    const trackRect = nav.getBoundingClientRect();
    const x = active.getBoundingClientRect().left - trackRect.left;
    const w = active.getBoundingClientRect().width;
    if (w <= 0) return;
    logDebug("nav-pill", "measure", { x: Math.round(x * 10) / 10, w: Math.round(w * 10) / 10 });
    placePill(x, w);
  }, [placePill]);

  // rAF-throttled wrapper for ResizeObserver bursts — the pill track only needs
  // one measurement per frame, not one per observation entry.
  const scheduleMeasure = useCallback(() => {
    if (measureTick.current) return;
    measureTick.current = window.requestAnimationFrame(() => {
      measureTick.current = 0;
      measurePill();
    });
  }, [measurePill]);

    /* Measure ONLY on events that can actually change track-relative geometry:
       route change (active item) and real size changes of the track (avatar
       swap, font swap, viewport compression). Scrolling is deliberately NOT a
       trigger — the header is position:fixed and every x is measured relative
       to the track box, so scroll can never legitimately move the pill; wiring
       scroll here used to re-measure mid-spring and jitter every repeat
       navigation (the up-to-1.6s scroll-restoration retries on Back made it
       fire over and over). */
  useLayoutEffect(() => {
    measurePill();
    /* One settled-frame correction right after commit catches a first paint
       that shifted geometry (route-exit lift, late image accent) BEFORE the
       viewer can perceive it, instead of a correction arriving mid-flight. */
    const settled = window.requestAnimationFrame(measurePill);
    return () => window.cancelAnimationFrame(settled);
  }, [measurePill, location.pathname]);

  // Once the first measured frame is on screen, every later pill movement is a
  // spring. Keeping this separate from the measurement effect means a fast
  // route change can never cancel the switch.
  useEffect(() => {
    if (pillAnimated) return undefined;
    const frame = window.requestAnimationFrame(() => setPillAnimated(true));
    return () => window.cancelAnimationFrame(frame);
  }, [pillAnimated]);

  /* Track size is the single honest "geometry changed" signal: it moves when
     the avatar swaps in, a font finishes loading, the viewport truly resizes,
     or flex pressure rescales the track. Scroll state is not in this list. */
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    if (typeof ResizeObserver === "undefined") {
      // Ancient-engine fallback: the viewport resize event is the closest signal.
      window.addEventListener("resize", scheduleMeasure);
      return () => window.removeEventListener("resize", scheduleMeasure);
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          scheduleMeasure();
          return;
        }
      }
    });
    observer.observe(nav);
    if (document.fonts?.ready) document.fonts.ready.then(measurePill);
    return () => {
      observer.disconnect();
      if (measureTick.current) window.cancelAnimationFrame(measureTick.current);
    };
  }, [scheduleMeasure, measurePill]);

  const pillTransition =
    reduceMotion || !pillAnimated
      ? { duration: 0 }
      : {
          x: SPRING.LIFT,
          width: { duration: DURATION.MED, ease: EASE_OUT },
          opacity: { duration: DURATION.FAST, ease: EASE_OUT },
        };

  return (
    <header className={`header-row${isScrolled ? " scrolled" : ""}`}>
      {/* RIVO scroll-progress rail: fixed top hairline with a white glow,
          width = scroll fraction via a CSS scroll timeline (header.css).
          Decorative; the scrolled header scrim below keeps it readable over
          bright backdrops. */}
      <div className="rivo-scroll-progress" aria-hidden="true" />
      <div className="header-brand-cluster">
      {/* Cinejoy-style back arrow — sits right before the brand logo on
          every non-home page; prefers history, falls back to home. */}
      <AnimatePresence mode="wait" initial={false}>
        {location.pathname !== "/" && (
          <motion.button
            key="back-btn"
            initial={false}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={false}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    opacity: { duration: DURATION.FAST, ease: EASE_OUT },
                    y: { duration: DURATION.FAST, ease: EASE_OUT },
                    x: { duration: DURATION.FAST, ease: EASE_OUT },
                  }
            }
          type="button"
          className="back-btn"
          aria-label="Go back"
          title="Go back"
          onClick={() => {
            // `window.history.length` counts the whole browser session (it
            // includes the new-tab page and prior sites), so it was ≥2 for a
            // deep-linked details page and navigate(-1) left the app entirely.
            // A react-router location that was never pushed by the app keeps the
            // literal key "default"; anything the app navigated to has a random
            // key. So "default" means there is no in-app history to go back to.
            if (location.key !== "default") {
              navigate(-1);
            } else {
              navigate("/");
            }
          }}
        >
          <ChevronLeft size={24} strokeWidth={1.5} />
        </motion.button>
      )}
      </AnimatePresence>

      <motion.div
        layout
        transition={reduceMotion ? { duration: 0 } : SPRING.LIFT}
        className="app-brand-link-wrap"
      >
        <Link to="/" className="app-brand-link" aria-label="Cinejoy home">
          <img
            src="/brand/cinejoy-logo.svg"
            alt="Cinejoy"
            className="brand-mark logo-legible"
            width={512}
            height={543}
            draggable={false}
          />
        </Link>
      </motion.div>
      </div>

      <nav ref={navRef} className={`navbar${isScrolled ? " scrolled" : ""}`} aria-label="Primary navigation">
        {/* Shared sliding highlight (Cinejoy .nav-pill) */}
        <motion.span
          className="nav-active-pill"
          initial={false}
          animate={{ x: pill.x, width: pill.w, opacity: pill.ready ? 1 : 0 }}
          transition={pillTransition}
          aria-hidden="true"
        />
        <div className="nav-cluster">
          <div className="nav-links">
            {NAV_ITEMS.map((item) => {
              const active = item.match(location.pathname);
              const label = t(`nav.${item.id}`);
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  data-nav-active={active ? "true" : undefined}
                  className={`nav-link${item.home ? " nav-link--home" : ""}${active ? " nav-link--active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  {/* Every tab keeps its icon at every width. The slot must
                      never appear/disappear on activation, or the right-docked
                      dock reflows before the pill has travelled. */}
                  <item.icon size={16} strokeWidth={2} className="nav-link-icon" />
                  <span className="nav-link-label">{label}</span>
                </Link>
              );
            })}
          </div>

          {/* Cinejoy-style divider between tabs and utility icons */}
          <span className="nav-separator" aria-hidden="true" />

          {/* Right — icon cluster: search · settings (Cinejoy: home,
              movies, shows, my list, search icon, settings icon — no
              watch-history icon; history lives in the settings dropdown) */}
          <div className="nav-right">
            {/* Search */}
            <Link
              to={{ pathname: "/search", search: location.search }}
              data-nav-active={location.pathname === "/search" ? "true" : undefined}
              className={`nav-icon-btn${location.pathname === "/search" ? " nav-icon-btn--active" : ""}`}
              aria-label={t("nav.search")}
              title={`${t("nav.search")} (Ctrl+K)`}
            >
              <Search size={18} strokeWidth={2} />
            </Link>

            {/* Notifications */}
            <NotificationCenter />

            {/* Settings / Account → dropdown */}
            <button
              ref={settingsBtnRef}
              type="button"
              data-nav-active={location.pathname === "/settings" ? "true" : undefined}
              className={`nav-icon-btn${location.pathname === "/settings" ? " nav-icon-btn--active" : ""}${user?.picture ? " nav-icon-btn--avatar" : ""}`}
              aria-label={user ? `${t("settings.tabs.account")} (${user.name || user.email})` : t("nav.settings")}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              title={user ? `${t("settings.tabs.account")} (${user.name || user.email})` : t("nav.settings")}
              style={user?.picture ? { padding: 3 } : undefined}
              onClick={toggleAccountMenu}
            >
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt={user.name || "User"}
                  className="w-[26px] h-[26px] rounded-full object-cover border border-white/30"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Settings size={18} strokeWidth={2} />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Settings dropdown — sibling of the pill so it isn't clipped by
          overflow:hidden nor trapped by the navbar's backdrop-filter root.
          Positioned with fixed coords measured off the toggle button. */}
      <AccountMenu
        open={accountMenuOpen}
        onClose={() => setAccountMenuOpen(false)}
        triggerRef={settingsBtnRef}
        position={menuPos}
      />
    </header>
  );
}

export default Header;