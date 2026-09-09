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
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import ErrorBoundary from "./components/ErrorBoundary";

import Loader from "./components/Loader";
import BackToTop from "./components/BackToTop";
import { useScrollRestoration } from "./hooks/useScrollRestoration";

/* Single source of truth for the navigation entries — feeds both the
   desktop nav (Home = white pill, rest = text links) and the mobile bottom bar. */
const NAV_ITEMS = [
  { id: "home", label: "Home", to: "/", icon: Home, home: true, match: (p) => p === "/" },
  { id: "movies", label: "Movies", to: "/movies", icon: Clapperboard, match: (p) => p.startsWith("/movies") },
  { id: "shows", label: "Shows", to: "/series", icon: Tv, match: (p) => p.startsWith("/series") },
  { id: "mylist", label: "My List", to: "/watchlist", icon: Bookmark, match: (p) => p === "/watchlist" },
];

const HomePage = lazy(() => import("./pages/HomePage"));
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
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="app-container">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* ── Apple-style Navbar ─────────────────────────────────────────────────
          Right-docked frosted glass dock · brand mark lives as a standalone
          fixed element on the left (opposite the nav) · nav links + icons right.
          Home renders as a solid white pill; the rest are text links. */}
      <nav className={`navbar${isScrolled ? " scrolled" : ""}`}>
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
                  {/* Icon shows on Home always, and on whichever page is active */}
                  {(item.home || active) && <item.icon size={15} strokeWidth={2} />}
                  <span className="nav-link-label">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Right — icon cluster: search · settings */}
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

          {/* Settings */}
          <Link
            to="/settings"
            className={`nav-icon-btn${location.pathname === "/settings" ? " nav-icon-btn--active" : ""}`}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={18} strokeWidth={2} />
          </Link>
        </div>
        </div>
      </nav>

      {/* Left — standalone brand mark, opposite the right-docked nav */}
      <div className="app-brand">
        <Link to="/" className="app-brand-link" aria-label="Streamly home">
          <span className="app-brand-mark">
            <svg viewBox="0 0 48 48" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="1.5" y="1.5" width="45" height="45" rx="14" fill="#ffffff" />
              <path d="M20.5 16 L32.5 24 L20.5 32 Z" fill="#050505" />
              <circle cx="13" cy="35" r="2.2" fill="#050505" />
            </svg>
          </span>
          <span className="app-brand-word">
            Stream<span className="app-brand-word-accent">ly</span>
          </span>
        </Link>
      </div>

      {/* Main Content Area with Page Transitions */}
      <main className="main-content" id="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            style={{ flex: 1 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Back to top */}
      <BackToTop />

      {/* Mobile Bottom Navigation Bar */}
      <div className="mobile-bottom-nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={`bottom-${item.id}`}
            to={item.to}
            className={`bottom-nav-item ${item.match(location.pathname) ? "active" : ""}`}
            aria-current={item.match(location.pathname) ? "page" : undefined}
          >
            <item.icon size={22} strokeWidth={2} />
            <span>{item.label}</span>
          </Link>
        ))}
        <Link to="/search" className={`bottom-nav-item ${location.pathname === "/search" ? "active" : ""}`}>
          <Search size={22} strokeWidth={2} />
          <span>Search</span>
        </Link>
      </div>
    </div>
  );
}

import GlobalShortcuts from "./components/GlobalShortcuts";

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
                element={<HomePage filter="series" title="Top TV Shows" />}
              />
              <Route
                path="/movies"
                element={
                  <HomePage filter="movies" title="Blockbuster Movies" />
                }
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
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <Router>
      <Loader variant="global" />
      <GlobalShortcuts />
      <Layout>
        <AppRoutes />
      </Layout>
    </Router>
  );
}

export default App;
