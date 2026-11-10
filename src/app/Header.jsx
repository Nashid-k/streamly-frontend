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
import { logDebug } from "../utils/debugLogger";

/* Solve the mass-spring ODE that framer's spring type integrates
   (x'' = (-stiffness·x − damping·x') / mass) and emit the sampled curve as a
   CSS linear() easing whose length equals the settle time. The pill then plays
   the exact SPRING token curve on the browser's own animation clock — no rAF
   loop of ours to starve, no framer projection to fight. Cached at module
   scope: the token is a constant. */
function buildSpringFlight({ stiffness, damping, mass = 1 }) {
  const dt = 1000 / 240;
  let x = 0;
  let v = 0;
  const samples = [0];
  for (let t = dt; t <= 2000; t += dt) {
    v += ((-stiffness * x - damping * v) / mass) * (dt / 1000);
    x += v * (dt / 1000);
    samples.push(Math.min(1.5, Math.max(-0.5, x)));
    if (t > 120 && Math.abs(x - 1) < 0.002 && Math.abs(v) < 0.002) break;
  }
  samples[samples.length - 1] = 1;
  return {
    duration: Math.round(samples.length * dt),
    easing: `linear(${samples.map((p) => p.toFixed(4)).join(", ")})`,
  };
}
const LIFT_FLIGHT = buildSpringFlight(SPRING.LIFT);

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

    /* ── Sliding active pill (Cinejoy .nav-pill) ─────────────────────────────
       One shared highlight glides between whatever nav item is active — brand
       links AND icon buttons on the same track. The pill used to be framer
       `animate` + React state, and every unrelated header re-render (scrolled
       flip, account-menu reset on pathname, badge counts) re-evaluated an
       in-flight spring and jittered the glide on repeat navigations. The
       element is now owned exclusively by one imperative flight per geometry
       change: measure → single WAAPI keyframe pair (translateX + width on the
       SPRING.LIFT curve solved into a linear() easing), commit styles on
       finish, cancel-and-relaunch from the live rendered position on retarget.
       No state, so no render can ever touch a running glide. */
  const navRef = useRef(null);
  const pillRef = useRef(null);
  // The very first placement is a cut: a hard load must not sweep the pill in
  // from x=0 before it has ever been measured.
  const pillPlaced = useRef(false);
  // Last committed destination — the continuity fallback when no animation is
  // running (the live computed style is authoritative mid-flight).
  const pillPos = useRef({ x: 0, w: 0 });
  const measureTick = useRef(0);

  const runPillFlight = useCallback(
    (destX, destW) => {
      const pillItem = pillRef.current;
      if (!pillItem) return;
      pillItem.style.opacity = "1";
      const commit = () => {
        pillItem.style.transform = `translateX(${destX}px)`;
        pillItem.style.width = `${destW}px`;
      };
      /* getAnimations (and WAAPI generally) is missing on old engines and in
         jsdom — a direct style cut is the correct degenerate flight there. */
      if (reduceMotion || typeof pillItem.getAnimations !== "function") {
        commit();
        pillPos.current = { x: destX, w: destW };
        return;
      }
      /* Start from the LIVE rendered position, not the last commit: a flight
         interrupted mid-glide continues from its current frame, so rapid
         repeat navigations chain instead of restarting the curve. */
      const running = pillItem.getAnimations();
      let startX = pillPos.current.x;
      let startW = pillPos.current.w;
      if (running.length > 0) {
        const computed = window.getComputedStyle(pillItem);
        const matrix = computed.transform.match(/matrix\(([^)]+)\)/);
        if (matrix) {
          const tx = parseFloat(matrix[1].split(",")[4]);
          if (Number.isFinite(tx)) startX = tx;
        }
        const liveW = parseFloat(computed.width);
        if (Number.isFinite(liveW)) startW = liveW;
      }
      /* Epsilon guard: sub-pixel drift (fractional rects, mid-transition
         reflows) must never relaunch the flight — only real geometry does. */
      if (Math.abs(destX - startX) < 0.5 && Math.abs(destW - startW) < 0.5) {
        pillPos.current = { x: destX, w: destW };
        return;
      }
      running.forEach((anim) => anim.cancel());
      const flight = pillItem.animate(
        [
          { transform: `translateX(${startX}px)`, width: `${startW}px` },
          { transform: `translateX(${destX}px)`, width: `${destW}px` },
        ],
        { duration: LIFT_FLIGHT.duration, easing: LIFT_FLIGHT.easing },
      );
      pillPos.current = { x: destX, w: destW };
      // Commit the destination into inline styles, then drop the animation —
      // cancelling after committing leaves no lingering fill to clean up.
      flight.onfinish = () => {
        commit();
        flight.cancel();
      };
    },
    [reduceMotion],
  );

  const measurePill = useCallback(() => {
    const nav = navRef.current;
    const pillItem = pillRef.current;
    if (!nav || !pillItem) return;
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
      if (pillItem.style.opacity !== "0") pillItem.style.opacity = "0";
      return;
    }
    const trackRect = nav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const x = activeRect.left - trackRect.left;
    const w = activeRect.width;
    if (w <= 0) return;
    logDebug("nav-pill", "measure", { x: Math.round(x * 10) / 10, w: Math.round(w * 10) / 10 });
    if (!pillPlaced.current) {
      pillPlaced.current = true;
      pillItem.style.transform = `translateX(${x}px)`;
      pillItem.style.width = `${w}px`;
      pillItem.style.opacity = "1";
      pillPos.current = { x, w };
      return;
    }
    runPillFlight(x, w);
  }, [runPillFlight]);

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
        {/* Shared sliding highlight (Cinejoy .nav-pill) — owned by the WAAPI
            flight engine above; these inline values are only the
            pre-measurement defaults, replaced by the first cut placement. */}
        <span
          ref={pillRef}
          className="nav-active-pill"
          style={{ opacity: 0, transform: "translateX(0px)", width: "0px" }}
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