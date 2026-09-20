import { useState, useEffect, useRef, useCallback, useLayoutEffect, Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Search,
  Settings,
  Home,
  Tv,
  Bookmark,
  Clapperboard,
  History,
  LogIn,
  ChevronLeft,
} from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";

import ErrorBoundary from "./components/ErrorBoundary";
import GlobalShortcuts from "./components/GlobalShortcuts";
import LiquidGlassDefs from "./components/LiquidGlassDefs";
import Popover from "./components/Popover";
import Loader from "./components/Loader";
import BackToTop from "./components/BackToTop";
import Footer from "./components/Footer";
import { useScrollRestoration } from "./hooks/useScrollRestoration";
import { usePreferences } from "./context/preferences";
import { useAppAuth } from "./context/auth";
import { useI18n } from "./i18n/index.jsx";

/* Single source of truth for navigation — feeds the desktop glass dock and
   the concise five-item mobile bar. */
// Kind of the title behind a details page (`/watch/<id>/...`) so the nav pill
// can light up correctly: `tv-*` / `tmdb-tv-*` ids are series, everything
// else on /watch is a movie. Mirrors movieService#isTvId.
const navWatchKind = (path) => {
  const m = path.match(/^\/watch\/([^/]+)/);
  if (!m) return null;
  const id = m[1];
  return id.startsWith("tmdb-tv-") || id.startsWith("tv-") || id.includes("-tv-")
    ? "series"
    : "movie";
};

const NAV_ITEMS = [
  { id: "home", label: "Home", to: "/", icon: Home, home: true, match: (p) => p === "/" },
  { id: "movies", label: "Movies", to: "/movies", icon: Clapperboard, match: (p) => p.startsWith("/movies") || navWatchKind(p) === "movie" },
  { id: "shows", label: "Shows", to: "/series", icon: Tv, match: (p) => p.startsWith("/series") || navWatchKind(p) === "series" },
  { id: "myList", label: "My List", to: "/watchlist", icon: Bookmark, match: (p) => p === "/watchlist" },
];

const HomePage = lazy(() => import("./pages/HomePage"));
const DiscoveryPage = lazy(() => import("./pages/DiscoveryPage"));
const TitleDetails = lazy(() => import("./pages/TitleDetailsPage"));
const PersonDetails = lazy(() => import("./pages/PersonDetailsPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const GenrePage = lazy(() => import("./pages/GenrePage"));
const WatchlistPage = lazy(() => import("./pages/WatchlistPage"));
const ExploreCollectionsPage = lazy(() => import("./pages/ExploreCollectionsPage"));
const PublicCollectionPage = lazy(() => import("./pages/PublicCollectionPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
function Layout({ children }) {
  useScrollRestoration();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { user } = useAppAuth();
  const { t } = useI18n();

  /* ── Settings dropdown (Cinejoy .head-menu) ──────────────────────────────
     Clicking the settings icon drops a menu with Login / Settings / Watch
     History (no Shorts). The menu is positioned with fixed coords measured
     off the button so it escapes the pill's overflow/backdrop root. */
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
     One shared highlight that glides between whatever nav item is active —
     brand links AND icon buttons on the same track. Position/width are driven
     by real DOM measurements fed into CSS vars so the transition uses the
     exact same `--nav-transition` cubic-bezier as the real site. */
  const navRef = useRef(null);
  const [pill, setPill] = useState({ x: 0, w: 0, ready: false });
  const measureTick = useRef(0);

  const measurePill = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    /* Measure against the navbar track with getBoundingClientRect — NOT
       offsetLeft. offsetLeft is relative to each item's nearest positioned
       ancestor, and the icon-items (Search/Settings) live in a different
       positioned cluster than the text links, so their pills would measure
       from a different origin and land slid off-track. A rect diff off the
       shared navbar box stays correct no matter which nested container the
       active item happens to sit in. */
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
  // (header grows/shrinks) or async icon mounts (fonts, auth). No more
  // measure-on-every-render.
  useLayoutEffect(() => {
    measurePill();
  }, [measurePill, location.pathname, isScrolled]);

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
    <div className="app-container">
      <LiquidGlassDefs />
      {/* ── Primary navigation ────────────────────────────────────────────────
          Two independent floating islands (Cinejoy .header-row):
          • brand-mark hangs ALONE at the left end
          • the desktop-nav glass pill (tabs · divider · icons) floats at the
            right end — no single connected navbar bar between them. */}
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
          <Popover
            isOpen={accountMenuOpen}
            onClose={() => setAccountMenuOpen(false)}
            triggerRef={settingsBtnRef}
            className="head-menu"
            align="left"
            style={menuPos ? { position: "fixed", top: menuPos.top, left: menuPos.left } : undefined}
            role="menu"
          >
            {user && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="head-menu-item head-menu-item--account"
                  onClick={() => navigate("/settings")}
                >
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name || "User"}
                      className="head-menu-avatar"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="head-menu-avatar head-menu-avatar--initial">
                      {(user.name || user.email || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="head-menu-account-text">
                    <span className="head-menu-account-name">{user.name}</span>
                    <span className="head-menu-account-email">{user.email}</span>
                  </span>
                </button>
                <div className="head-menu-sep" />
              </>
            )}
            {!user && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="head-menu-item"
                  onClick={() => navigate("/settings")}
                >
                  <LogIn size={16} className="head-menu-item-icon" />
                  <span>{t("nav.login")}</span>
                </button>
                <div className="head-menu-sep" />
              </>
            )}
            <button
              type="button"
              role="menuitem"
              className="head-menu-item"
              onClick={() => navigate("/settings")}
            >
              <Settings size={16} className="head-menu-item-icon" />
              <span>{t("nav.settings")}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="head-menu-item"
              onClick={() => navigate("/history")}
            >
              <History size={16} className="head-menu-item-icon" />
              <span>{t("nav.watchHistory")}</span>
            </button>
          </Popover>
        </div>

      {/* Main Content Area with Page Transitions */}
      <main className="app-main" id="main-content" tabIndex={-1}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
            style={{ flex: 1 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Back to top */}
      <BackToTop />

      {/* Global footer — Streamly wordmark, disclaimer, contact */}
      <Footer />

      {/* Mobile Bottom Navigation — Cinejoy-style floating icon pill */}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {[
          { id: "home", label: t("nav.home"), to: "/", icon: Home, match: (p) => p === "/" },
          { id: "movies", label: t("nav.movies"), to: "/movies", icon: Clapperboard, match: (p) => p.startsWith("/movies") || navWatchKind(p) === "movie" },
          { id: "shows", label: t("nav.shows"), to: "/series", icon: Tv, match: (p) => p.startsWith("/series") || navWatchKind(p) === "series" },
          { id: "myList", label: t("nav.myList"), to: "/watchlist", icon: Bookmark, match: (p) => p === "/watchlist" || p === "/history" },
          { id: "search", label: t("nav.search"), to: "/search", icon: Search, match: (p) => p === "/search" },
          { id: "settings", label: user ? t("settings.tabs.account") : t("nav.settings"), to: "/settings", icon: Settings, match: (p) => p === "/settings" },
        ].map((item) => {
          const active = item.match(location.pathname);
          return (
            <Link
              key={`bottom-${item.id}`}
              to={item.to}
              className={`bottom-nav-item ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
            >
              {item.id === "settings" && user?.picture ? (
                <img
                  src={user.picture}
                  alt={user.name || "User"}
                  className="w-6 h-6 rounded-full object-cover border border-white/40"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <item.icon size={24} strokeWidth={2} />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/* Routes wrapped in a route-keyed ErrorBoundary + Suspense so a page that
   crashes shows the fallback once but recovers automatically the moment the
   user navigates (without requiring a hard reload). */
function AppRoutes() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Suspense fallback={<Loader />}>
        <Routes>
              <Route
                path="/"
                element={
                  <HomePage filter="all" />
                }
              />
              <Route
                path="/series"
                element={<DiscoveryPage mode="series" />}
              />
              <Route
                path="/movies"
                element={<DiscoveryPage mode="movies" />}
              />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/category/:name" element={<CategoryPage />} />
              <Route path="/genre/:genre" element={<GenrePage />} />
              <Route path="/watch/:id/:slug?" element={<TitleDetails />} />
              <Route path="/person/:id/:slug?" element={<PersonDetails />} />
              {/* Legacy redirects */}
              <Route path="/watchlist" element={<WatchlistPage />} />
              <Route
                path="/explore/collections"
                element={<ExploreCollectionsPage />}
              />
              <Route
                path="/collections/:publicId"
                element={<PublicCollectionPage />}
              />
              <Route path="/mylist" element={<Navigate to="/watchlist" replace />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/continue-watching" element={<Navigate to="/history" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  const { reduceMotion } = usePreferences();
  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <Router>
        <Loader variant="global" />
        <GlobalShortcuts />
        <Layout>
          <AppRoutes />
        </Layout>
      </Router>
    </MotionConfig>
  );
}

export default App;
