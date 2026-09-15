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
  Clock,
} from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";

import ErrorBoundary from "./components/ErrorBoundary";
import GlobalShortcuts from "./components/GlobalShortcuts";
import Loader from "./components/Loader";
import BackToTop from "./components/BackToTop";
import Footer from "./components/Footer";
import { useScrollRestoration } from "./hooks/useScrollRestoration";
import { usePreferences } from "./context/preferences";
import { useAppAuth } from "./context/auth";

/* Single source of truth for navigation — feeds the desktop glass dock and
   the concise five-item mobile bar. */
const NAV_ITEMS = [
  { id: "home", label: "Home", to: "/", icon: Home, home: true, match: (p) => p === "/" },
  { id: "movies", label: "Movies", to: "/movies", icon: Clapperboard, match: (p) => p.startsWith("/movies") },
  { id: "shows", label: "Shows", to: "/series", icon: Tv, match: (p) => p.startsWith("/series") },
  { id: "mylist", label: "My List", to: "/watchlist", icon: Bookmark, match: (p) => p === "/watchlist" },
];

const HomePage = lazy(() => import("./pages/HomePage"));
const DiscoveryPage = lazy(() => import("./pages/DiscoveryPage"));
const TitleDetails = lazy(() => import("./pages/TitleDetailsPage"));
const PersonDetails = lazy(() => import("./pages/PersonDetailsPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const GenrePage = lazy(() => import("./pages/GenrePage"));
const WatchlistPage = lazy(() => import("./pages/WatchlistPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
function Layout({ children }) {
  useScrollRestoration();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { user } = useAppAuth();

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

  const measurePill = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector('[data-nav-active="true"]');
    const x = active ? active.offsetLeft : 0;
    const w = active ? active.offsetWidth : 0;
    setPill((prev) => (prev.x === x && prev.w === w ? prev : { x, w, ready: true }));
  }, []);

  useLayoutEffect(() => {
    measurePill();
  });

  useEffect(() => {
    window.addEventListener("resize", measurePill);
    window.addEventListener("scroll", measurePill, { passive: true });
    if (document.fonts?.ready) document.fonts.ready.then(measurePill);
    return () => {
      window.removeEventListener("resize", measurePill);
      window.removeEventListener("scroll", measurePill);
    };
  }, [measurePill]);

  return (
    <div className="app-container">
      {/* ── Primary navigation ────────────────────────────────────────────────
          Two independent floating islands (Cinejoy .header-row):
          • brand-mark hangs ALONE at the left end
          • the desktop-nav glass pill (tabs · divider · icons) floats at the
            right end — no single connected navbar bar between them. */}
      <div className={`header-row${isScrolled ? " scrolled" : ""}`}>
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
                    <span className="nav-link-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Cinejoy-style divider between tabs and utility icons */}
            <span className="nav-separator" aria-hidden="true" />

            {/* Right — icon cluster: search · history · settings */}
          <div className="nav-right">
            {/* Search */}
            <Link
              to="/search"
              data-nav-active={location.pathname === "/search" ? "true" : undefined}
              className={`nav-icon-btn${location.pathname === "/search" ? " nav-icon-btn--active" : ""}`}
              aria-label="Search"
              title="Search (Ctrl+K)"
            >
              <Search size={18} strokeWidth={2} />
            </Link>

            {/* History */}
            <Link
              to="/history"
              data-nav-active={location.pathname === "/history" ? "true" : undefined}
              className={`nav-icon-btn${location.pathname === "/history" ? " nav-icon-btn--active" : ""}`}
              aria-label="Watch History"
              title="Watch History"
            >
              <Clock size={18} strokeWidth={2} />
            </Link>

            {/* Settings / Account */}
            <Link
              to="/settings"
              data-nav-active={location.pathname === "/settings" ? "true" : undefined}
              className={`nav-icon-btn${location.pathname === "/settings" ? " nav-icon-btn--active" : ""}`}
              aria-label={user ? `Account (${user.name || user.email})` : "Settings"}
              title={user ? `Account (${user.name || user.email})` : "Settings"}
              style={user?.picture ? { padding: 3 } : undefined}
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
            </Link>
          </div>
          </div>
        </nav>
      </div>

      {/* Main Content Area with Page Transitions */}
      <main className="app-main" id="main-content" tabIndex={-1}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -3 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
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
          { id: "home", label: "Home", to: "/", icon: Home, match: (p) => p === "/" },
          { id: "movies", label: "Movies", to: "/movies", icon: Clapperboard, match: (p) => p.startsWith("/movies") },
          { id: "shows", label: "Shows", to: "/series", icon: Tv, match: (p) => p.startsWith("/series") },
          { id: "mylist", label: "My List", to: "/watchlist", icon: Bookmark, match: (p) => p === "/watchlist" || p === "/history" },
          { id: "search", label: "Search", to: "/search", icon: Search, match: (p) => p === "/search" },
          { id: "settings", label: user ? "Account" : "Settings", to: "/settings", icon: Settings, match: (p) => p === "/settings" },
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
                  <HomePage filter="all" title="Trending Now" />
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
