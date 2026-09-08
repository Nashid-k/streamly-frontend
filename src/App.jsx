import { useState, useEffect, useRef, Suspense, lazy } from "react";
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
  Clock,
  Keyboard,
  Film,
  Clapperboard,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import ErrorBoundary from "./components/ErrorBoundary";

import Loader from "./components/Loader";
import BackToTop from "./components/BackToTop";
import Popover from "./components/Popover";
import { useScrollRestoration } from "./hooks/useScrollRestoration";

const APP_VERSION = __VERSION__ || "1.0.0";

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

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const moreRef = useRef(null);

  useEffect(() => {
    setShowMoreMenu(false);
  }, [location.pathname]);

  // Close the settings menu when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowMoreMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="app-container">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* ── Apple-style Navbar ─────────────────────────────────────────────────
          Full-width frosted glass bar · logo left · nav links + icons right.
          Home renders as a solid white pill; the rest are text links. */}
      <nav className={`navbar${isScrolled ? " scrolled" : ""}`}>
        {/* Left — logo mark + wordmark */}
        <div className="nav-left">
          <Link to="/" className="logo" aria-label="Streamly home">
            <div className="logo-icon">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="30" height="30" rx="8.5" fill="#ffffff" />
                <path d="M12.6 9.4 L23 16 L12.6 22.6 Z" fill="#050505" />
              </svg>
            </div>
            <span className="logo-word">Streamly</span>
            <span className="logo-version">v{APP_VERSION}</span>
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

          {/* Settings — keyboard shortcuts */}
          <div ref={moreRef} style={{ position: "relative" }}>
            <button
              type="button"
              className={`nav-icon-btn${showMoreMenu ? " nav-icon-btn--active" : ""}`}
              aria-label="Settings"
              aria-haspopup="menu"
              aria-expanded={showMoreMenu}
              onClick={() => setShowMoreMenu((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setShowMoreMenu((v) => !v);
                }
              }}
            >
              <Settings size={18} strokeWidth={2} />
            </button>

            <Popover
              isOpen={showMoreMenu}
              onClose={() => setShowMoreMenu(false)}
              triggerRef={moreRef}
              className="more-popover"
              style={{ padding: "8px 0", width: "min(220px, calc(100vw - 2rem))", right: -10 }}
            >
              <Link to="/watchlist" onClick={() => setShowMoreMenu(false)} className="menu-item"><Bookmark size={16} /> My List</Link>
              <Link to="/history" onClick={() => setShowMoreMenu(false)} className="menu-item"><Clock size={16} /> Watch History</Link>
              <hr className="menu-divider" />
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setShowMoreMenu(false);
                  window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true }));
                }}
              >
                <Keyboard size={16} /> Keyboard Shortcuts
              </button>
            </Popover>
          </div>
        </div>
        </div>
      </nav>

      {/* Main Content Area with Page Transitions */}
      <main className="main-content" id="main-content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
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
