import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Settings, ChevronLeft, Download } from "lucide-react";
import { NAV_ITEMS } from "../constants/navigation";
import { useI18n } from "../i18n/index.jsx";
import { useAppAuth } from "../context/auth";
import { useDownloads } from "../context/downloads";
import AccountMenu from "./AccountMenu";

/* ── Primary navigation ────────────────────────────────────────────────────
   Two independent floating islands (Cinejoy .header-row): the brand mark hangs
   ALONE at the left end, the desktop-nav glass pill (tabs · divider · icons)
   floats at the right end — no connected navbar bar between them. */
function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAppAuth();
  const { t } = useI18n();
  const { downloads, activeCount } = useDownloads();

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
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        navigate("/search");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

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
       measurements fed into CSS vars, so the transition reuses the site's own
       `--nav-transition` cubic-bezier. */
  const navRef = useRef(null);
  const [pill, setPill] = useState({ x: 0, w: 0, ready: false });
  const measureTick = useRef(0);

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
    const trackRect = nav.getBoundingClientRect();
    const x = active ? active.getBoundingClientRect().left - trackRect.left : 0;
    const w = active ? active.getBoundingClientRect().width : 0;
    setPill((prev) => (prev.x === x && prev.w === w ? prev : { x, w, ready: true }));
  }, []);

  // rAF-throttled wrapper for frequent scroll/resize events — the pill track
  // only needs one measurement per frame, not one per event.
  const scheduleMeasure = useCallback(() => {
    if (measureTick.current) return;
    measureTick.current = window.requestAnimationFrame(() => {
      measureTick.current = 0;
      measurePill();
    });
  }, [measurePill]);

    // Measure when the nav could actually change: route change, scrolled state
    // (the header grows/shrinks) or async icon mounts. Never on every render.
  useLayoutEffect(() => {
    measurePill();
  }, [measurePill, location.pathname, isScrolled, downloads.length]);

  useEffect(() => {
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    if (document.fonts?.ready) document.fonts.ready.then(measurePill);
    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure);
      if (measureTick.current) window.cancelAnimationFrame(measureTick.current);
    };
  }, [scheduleMeasure, measurePill]);

  return (
    <div className={`header-row${isScrolled ? " scrolled" : ""}`}>
      {/* Cinejoy-style back arrow — sits right before the brand logo on
          every non-home page; prefers history, falls back to home. */}
      {location.pathname !== "/" && (
        <button
          type="button"
          className="back-btn"
          aria-label="Go back"
          title="Go back"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate("/");
            }
          }}
        >
          <ChevronLeft size={24} strokeWidth={1.5} />
        </button>
      )}

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

      <nav ref={navRef} className={`navbar${isScrolled ? " scrolled" : ""}`} aria-label="Primary navigation">
        {/* Shared sliding highlight (Cinejoy .nav-pill) */}
        <span
          className="nav-active-pill"
          style={{
            transform: `translateX(${pill.x}px)`,
            width: `${pill.w}px`,
            opacity: pill.ready ? 1 : 0,
          }}
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
                  {/* Icon shows on compact/tablet viewports, and on Home or active page in desktop */}
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
            {/* Downloads — appears once any download exists in this session */}
            {downloads.length > 0 && (
              <Link
                to="/downloads"
                data-nav-active={location.pathname === "/downloads" ? "true" : undefined}
                className={`nav-icon-btn${location.pathname === "/downloads" ? " nav-icon-btn--active" : ""}`}
                aria-label={t("nav.downloads")}
                title={t("nav.downloads")}
              >
                <Download size={18} strokeWidth={2} />
                {activeCount > 0 && <span className="nav-badge">{activeCount}</span>}
              </Link>
            )}

            {/* Search */}
            <Link
              to="/search"
              data-nav-active={location.pathname === "/search" ? "true" : undefined}
              className={`nav-icon-btn${location.pathname === "/search" ? " nav-icon-btn--active" : ""}`}
              aria-label={t("nav.search")}
              title={`${t("nav.search")} (Ctrl+K)`}
            >
              <Search size={18} strokeWidth={2} />
            </Link>

            {/* Settings / Account → dropdown */}
            <button
              ref={settingsBtnRef}
              type="button"
              data-nav-active={location.pathname === "/settings" ? "true" : undefined}
              className={`nav-icon-btn${location.pathname === "/settings" ? " nav-icon-btn--active" : ""}`}
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
    </div>
  );
}

export default Header;