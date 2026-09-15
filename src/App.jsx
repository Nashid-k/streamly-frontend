import { useState, useEffect, Suspense, lazy } from "react";
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

  return (
    <div className="app-container">
      {/* ── Primary navigation ─────────────────────────────────────────────────
          One-piece centered frosted pill (Cinejoy-style): brand mark sits at
          the pill's left edge, tabs in the middle, a divider, then the
          utility icon cluster (search · history · settings) on the right. */}
      <nav className={`navbar${isScrolled ? " scrolled" : ""}`} aria-label="Primary navigation">
        <div className="app-brand">
          <Link to="/" className="app-brand-link" aria-label="Streamly home">
            <span className="app-brand-mark">
              <svg viewBox="0 0 48 48" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                  <linearGradient id="brand-accent-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                    <stop offset="0" style={{ stopColor: "var(--accent-primary, #f43f5e)" }} />
                    <stop offset="1" style={{ stopColor: "var(--accent-secondary, #fb923c)" }} />
                  </linearGradient>
                </defs>
                <rect x="1.5" y="1.5" width="45" height="45" rx="14" style={{ fill: "url(#brand-accent-grad)" }} />
                <path d="M20.5 16 L32.5 24 L20.5 32 Z" style={{ fill: "var(--on-accent, #ffffff)" }} />
                <circle cx="13" cy="35" r="2.2" style={{ fill: "var(--on-accent, #ffffff)" }} />
              </svg>
            </span>
            <span className="app-brand-word">
              Stream<span className="app-brand-word-accent">ly</span>
            </span>
          </Link>
        </div>
        {/* Right — nav links + icon cluster */}
        <div className="nav-cluster">
          <div className="nav-links">
            {NAV_ITEMS.map((item) => {
              const active = item.match(location.pathname);
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  className={`nav-link${item.home ? " nav-link--home" : ""}${active ? " nav-link--active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  {active && !item.home && (
                    <motion.span
                      layoutId="nav-active-pill"
                      className="nav-active-pill"
                      transition={{ type: "spring", stiffness: 320, damping: 28 }}
                    />
                  )}
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
            className={`nav-icon-btn${location.pathname === "/search" ? " nav-icon-btn--active" : ""}`}
            aria-label="Search"
            title="Search (Ctrl+K)"
          >
            <Search size={18} strokeWidth={2} />
          </Link>

          {/* History */}
          <Link
            to="/history"
            className={`nav-icon-btn${location.pathname === "/history" ? " nav-icon-btn--active" : ""}`}
            aria-label="Watch History"
            title="Watch History"
          >
            <Clock size={18} strokeWidth={2} />
          </Link>

          {/* Settings / Account */}
          <Link
            to="/settings"
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
