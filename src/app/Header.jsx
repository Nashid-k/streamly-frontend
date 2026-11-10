import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search, Settings, ChevronLeft } from "lucide-react";
import { NAV_ITEMS } from "../constants/navigation";
import { SPRING, DURATION, EASE_OUT } from "../constants/motion";
import { useI18n } from "../i18n/index.jsx";
import { useAppAuth } from "../context/auth";
import { useOptionalPreferences } from "../context/preferences";
import AccountMenu from "./AccountMenu";
import NotificationCenter from "../components/NotificationCenter";
import BrandWordmark from "../components/BrandWordmark";

/* The search control advertises its shortcut, and the shortcut differs by
   platform: the handler below listens for metaKey OR ctrlKey, so the hint has
   to name the key the viewer actually owns. Resolved once at module scope —
   navigator doesn't change mid-session. */
const SEARCH_HINT =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform || "")
    ? "\u2318K"
    : "Ctrl K";

/* ── Primary navigation ────────────────────────────────────────────────────
   Two independent floating islands (Cinejoy .header-row): the brand mark hangs
   ALONE at the left end, the desktop-nav glass pill (tabs · divider · icons)
   floats at the right end — no connected navbar bar between them. */
function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAppAuth();
  const { t } = useI18n();
  const osReducedMotion = useReducedMotion();
  const prefs = useOptionalPreferences();
  // The pill engine runs outside framer, so the in-app reduce-motion
  // preference has to be honoured here as well, not only via MotionConfig.
  const reduceMotion = osReducedMotion || !!prefs?.reduceMotion;

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

    /* Active-tab highlight: JS-measured CSS custom properties, transition gated. */
  const navRef = useRef(null);
  const lastActiveRef = useRef(null);
  const pillTimerRef = useRef(0);

  /* Ends the glide and puts the pill back into snap mode for geometry-only
     settles (font load, avatar swap, resize). `transitionend` normally calls
     this; the timer in `measurePill` is the fallback for an event that never
     arrives (hidden tab, interrupted transition, reduced motion). */
  const endPillGlide = useCallback(() => {
    if (pillTimerRef.current) {
      window.clearTimeout(pillTimerRef.current);
      pillTimerRef.current = 0;
    }
    navRef.current?.removeAttribute("data-pill-moving");
  }, []);

  const measurePill = useCallback(
    (animate = false) => {
      const nav = navRef.current;
      if (!nav) return;
      const pillItem = nav.querySelector(".nav-active-pill");
      if (!pillItem) return;
      const active = nav.querySelector('[data-nav-active="true"]');
      const hasActive = !!active;
      nav.toggleAttribute("data-has-active", hasActive);
      if (!active) {
        lastActiveRef.current = null;
        endPillGlide();
        return;
      }
      const trackRect = nav.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const x = activeRect.left - trackRect.left;
      const w = activeRect.width;
      if (w <= 0) return;
      const activeChanged = lastActiveRef.current !== null && lastActiveRef.current !== active;
      lastActiveRef.current = active;

      if (activeChanged && animate) {
        // The gate has to be live for a style pass BEFORE the custom properties
        // move, and it has to stay live until the glide finishes. The old code
        // cleared it in the rAF settle 11-16ms later — before a single frame
        // painted with a transition — so the pill teleported every time.
        nav.setAttribute("data-pill-moving", "true");
        // Force a style flush that sees the transition enabled; the property
        // updates below then start a real transition instead of a jump.
        void getComputedStyle(pillItem).transform;
        if (pillTimerRef.current) window.clearTimeout(pillTimerRef.current);
        pillTimerRef.current = window.setTimeout(endPillGlide, 360);
      }
      // Any re-measure while moving retargets the live transition (CSS
      // interpolates from the current position); it must NOT drop the gate.
      nav.style.setProperty("--pill-x", x + "px");
      nav.style.setProperty("--pill-w", w + "px");
    },
    [endPillGlide],
  );

  useLayoutEffect(() => {
    // Only a real active-tab change glides; the settle rAF re-measures after
    // late geometry changes and must snap (or retarget, never restart).
    measurePill(true);
    const settled = window.requestAnimationFrame(() => measurePill());
    return () => window.cancelAnimationFrame(settled);
  }, [measurePill, location.pathname]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const onPillTransitionEnd = (event) => {
      if (event.target === nav.querySelector(".nav-active-pill")) endPillGlide();
    };
    nav.addEventListener("transitionend", onPillTransitionEnd);
    return () => {
      nav.removeEventListener("transitionend", onPillTransitionEnd);
      if (pillTimerRef.current) {
        window.clearTimeout(pillTimerRef.current);
        pillTimerRef.current = 0;
      }
    };
  }, [endPillGlide]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (typeof ResizeObserver === "undefined") {
      const onResize = () => measurePill();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
    const observer = new ResizeObserver(() => measurePill());
    observer.observe(nav);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measurePill);
    return () => observer.disconnect();
  }, [measurePill]);

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
        <Link to="/" className="app-brand-link" aria-label="Streamly home">
          <BrandWordmark className="logo-legible" />
        </Link>
      </motion.div>
      </div>

      <nav ref={navRef} className={`navbar${isScrolled ? " scrolled" : ""}`} aria-label="Primary navigation">
        {/* Shared sliding highlight (Cinejoy .nav-pill) — positioned by the
            JS-measured --pill-x/--pill-w custom properties (see header.css and
            measurePill). Only a genuine active-tab change enables the glide;
            late geometry settles snap or retarget instead of restarting it. */}
        <span className="nav-active-pill" aria-hidden="true" />
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
              className={`nav-icon-btn nav-icon-btn--search${location.pathname === "/search" ? " nav-icon-btn--active" : ""}`}
              aria-label={`${t("nav.search")} (${SEARCH_HINT})`}
              title={`${t("nav.search")} (${SEARCH_HINT})`}
            >
              <Search size={18} strokeWidth={2} />
              <kbd className="nav-search-hint" aria-hidden="true">
                {SEARCH_HINT}
              </kbd>
            </Link>

            {/* Notifications */}
            <NotificationCenter />

            {/* Settings / Account → dropdown */}
            <button
              ref={settingsBtnRef}
              type="button"
              data-nav-active={location.pathname === "/settings" ? "true" : undefined}
              className={`nav-icon-btn${location.pathname === "/settings" ? " nav-icon-btn--active" : ""}${user ? " nav-icon-btn--avatar" : ""}`}
              aria-label={user ? `${t("settings.tabs.account")} (${user.name || user.email})` : t("nav.settings")}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              title={user ? `${t("settings.tabs.account")} (${user.name || user.email})` : t("nav.settings")}
              style={user ? { padding: 3 } : undefined}
              onClick={toggleAccountMenu}
            >
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt={user.name || "User"}
                  className="w-[26px] h-[26px] rounded-full object-cover border border-white/30"
                  referrerPolicy="no-referrer"
                />
              ) : user ? (
                /* Signed in without a photo (email sign-up): show the account
                   initial instead of a settings gear, so the utility slot
                   reads as "who you are", not "where the gear lives". */
                <span className="nav-avatar-initial" aria-hidden="true">
                  {(user.email || user.name || "?").trim().charAt(0).toUpperCase()}
                </span>
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