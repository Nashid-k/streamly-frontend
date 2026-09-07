import { useState, useEffect, useRef, useMemo, Suspense, lazy } from "react";
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
  Home,
  Bookmark,
  Clock,
  User,
  Bell,
  Tv,
  Keyboard,
  LogOut,
  Film,
  Sparkles,
  Clapperboard,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppAuth } from "./context/AuthContext";

import ErrorBoundary from "./components/ErrorBoundary";

import Loader from "./components/Loader";
import BackToTop from "./components/BackToTop";
import AuthModal from "./components/AuthModal";
import PlatformIcon from "./components/PlatformIcon";
import Popover from "./components/Popover";
import { useScrollRestoration } from "./hooks/useScrollRestoration";

const APP_VERSION = __VERSION__ || "1.0.0";

/* Single source of truth for the navigation entries — feeds both the
   desktop glass pill and the mobile bottom bar. */
const NAV_ITEMS = [
  { id: "home", label: "Home", to: "/", icon: Home, match: (p) => p === "/" },
  { id: "movies", label: "Movies", to: "/movies", icon: Clapperboard, match: (p) => p.startsWith("/movies") },
  { id: "shows", label: "Shows", to: "/series", icon: Tv, match: (p) => p.startsWith("/series") },
  { id: "mylist", label: "My List", to: "/watchlist", icon: Bookmark, match: (p) => p === "/watchlist" },
];

const HomePage = lazy(() => import("./pages/HomePage"));
const TitleDetails = lazy(() => import("./pages/TitleDetailsPage"));
const PersonDetails = lazy(() => import("./pages/PersonDetailsPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const WatchlistPage = lazy(() => import("./pages/WatchlistPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const GenrePage = lazy(() => import("./pages/GenrePage"));

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

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Auth state from Firebase
  const {
    user,
    logout,
    notifications,
    markAllAsRead,
    clearNotifications,
  } = useAppAuth();

  const unreadCount = useMemo(() => (notifications || []).filter((n) => !n.isRead).length, [notifications]);

  // Close any signed-in-only menus if auth drops (prevents rendering menu
  // content while `user` is undefined during the popover exit animation).
  useEffect(() => {
    if (!user) {
      setShowUserMenu(false);
      setShowNotifications(false);
    }
  }, [user]);

  const notificationsRef = useRef(null);
  const pillProfileRef = useRef(null);

  useEffect(() => {
    setShowUserMenu(false);
    setShowNotifications(false);
  }, [location.pathname]);

  // Close menus when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pillProfileRef.current && !pillProfileRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(e.target)
      ) {
        setShowNotifications(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowUserMenu(false);
        setShowNotifications(false);
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
      {/* Top Navbar — logo on the left, glass-morphic pill on the right */}
      <nav
        className={`navbar${isScrolled ? ' scrolled' : ''}`}
        style={{
          background: isScrolled
            ? "linear-gradient(180deg, rgba(5,5,5,0.92) 0%, rgba(5,5,5,0.82) 100%)"
            : "transparent",
          borderBottom: isScrolled
            ? "1px solid rgba(255,255,255,0.07)"
            : "none",
          boxShadow: isScrolled
            ? "0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.5)"
            : "none",
        }}
      >
        <div className="nav-left">
          <Link to="/" className="logo" aria-label="Streamly home">
            {/* iOS-inspired monochrome mark — white squircle + black play */}
            <div className="logo-icon">
              <svg width="30" height="30" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="30" height="30" rx="8.5" fill="#ffffff" />
                <path d="M12.6 9.4 L23 16 L12.6 22.6 Z" fill="#050505" />
              </svg>
            </div>
            <span className="logo-word">Streamly</span>
            <span className="logo-version" style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', padding: '2px 6px', borderRadius: '6px', fontWeight: 700, marginLeft: '6px', letterSpacing: '0.05em', verticalAlign: 'super' }}>v{APP_VERSION}</span>
          </Link>
        </div>

        <div className="nav-right">
          {/* Desktop glass-morphic pill — monochrome icons, spring-active bubble */}
          <div className="nav-pill">
            {NAV_ITEMS.map((item) => {
              const active = item.match(location.pathname);
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  className={`nav-pill-item${active ? " active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill-active"
                      className="nav-pill-active"
                      transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.9 }}
                    />
                  )}
                  <item.icon size={16} strokeWidth={2} />
                  <span className="nav-pill-label">{item.label}</span>
                </Link>
              );
            })}

            <div className="nav-pill-divider" aria-hidden="true" />

            {/* Search — opens the full search page (Cmd/Ctrl+K too) */}
            <Link
              to="/search"
              className={`nav-pill-item${location.pathname === "/search" ? " active" : ""}`}
              aria-current={location.pathname === "/search" ? "page" : undefined}
            >
              {location.pathname === "/search" && (
                <motion.span
                  layoutId="nav-pill-active"
                  className="nav-pill-active"
                  transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.9 }}
                />
              )}
              <Search size={16} strokeWidth={2} />
              <span className="nav-pill-label">Search</span>
            </Link>

            {/* Profile / Sign In — dropdown anchored inside the pill */}
            <div ref={pillProfileRef} style={{ position: "relative" }}>
              <div
                className={`nav-pill-item${showUserMenu && user ? " profile-open" : ""}`}
                role="button"
                tabIndex={0}
                aria-haspopup="menu"
                aria-expanded={user ? showUserMenu : undefined}
                aria-label={user ? "User menu" : "Sign In"}
                title={user ? user.displayName || user.email : "Sign In"}
                onClick={() =>
                  user ? setShowUserMenu(!showUserMenu) : setShowAuthModal(true)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (user) setShowUserMenu(!showUserMenu);
                    else setShowAuthModal(true);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                {user ? (
                  <span className="nav-pill-avatar">
                    {(user.displayName || user.email || "?")[0].toUpperCase()}
                  </span>
                ) : (
                  <User size={16} strokeWidth={2} />
                )}
                <span className="nav-pill-label">
                  {user ? "Profile" : "Sign In"}
                </span>
              </div>
              <Popover
                isOpen={!!(showUserMenu && user)}
                onClose={() => setShowUserMenu(false)}
                triggerRef={pillProfileRef}
                style={{ padding: "8px 0", minWidth: "220px" }}
              >
                {/* Signed-in user info */}
                <div
                  style={{
                    padding: "10px 16px 8px",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    marginBottom: "4px",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      color: "#fff",
                    }}
                  >
                    {user?.displayName || "Streamer"}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#71717a",
                      marginTop: "2px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user?.email || ""}
                  </div>
                </div>

                <Link
                  to="/watchlist"
                  onClick={() => setShowUserMenu(false)}
                  className="menu-item"
                >
                  <Bookmark size={16} /> My List
                </Link>
                <Link
                  to="/history"
                  onClick={() => setShowUserMenu(false)}
                  className="menu-item"
                >
                  <Clock size={16} /> Watch History
                </Link>
                <hr className="menu-divider" />
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setShowUserMenu(false);
                    window.dispatchEvent(
                      new KeyboardEvent("keydown", {
                        key: "?",
                        shiftKey: true,
                      }),
                    );
                  }}
                >
                  <Keyboard size={16} /> Keyboard Shortcuts
                </button>
                <hr className="menu-divider" />
                <button
                  type="button"
                  className="menu-item menu-item--danger"
                  onClick={async () => {
                    setShowUserMenu(false);
                    await logout();
                  }}
                >
                  <LogOut size={16} /> Sign Out
                </button>
              </Popover>
            </div>
          </div>

          {/* Notifications Dropdown */}
          <div
            ref={notificationsRef}
            style={{
              position: "relative",
              marginRight: "1rem",
              display: "flex",
              alignItems: "center",
            }}
          >
            <div
              className="user-avatar"
              role="button"
              tabIndex={0}
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              aria-expanded={showNotifications}
              onClick={() => {
                setShowNotifications(!showNotifications);
                if (
                  !showNotifications &&
                  (notifications || []).some((n) => !n.isRead)
                ) {
                  markAllAsRead();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowNotifications(!showNotifications);
                  if (!showNotifications && (notifications || []).some((n) => !n.isRead)) {
                    markAllAsRead();
                  }
                }
              }}
              style={{
                background: "transparent",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <Bell size={20} aria-label="Notifications" color="#e4e4e7" />
              {unreadCount > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "2px",
                    right: "4px",
                    width: "16px",
                    height: "16px",
                    background: "#ef4444",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.65rem",
                    fontWeight: "bold",
                    color: "#fff",
                  }}
                >
                  {unreadCount}
                </div>
              )}
            </div>
            <Popover
              isOpen={showNotifications}
              onClose={() => setShowNotifications(false)}
              triggerRef={notificationsRef}
              className="notifications-popover"
              scrollable
              style={{
                padding: "8px 0",
                width: "min(320px, calc(100vw - 2rem))",
                right: -10,
              }}
            >
                  <div
                    style={{
                      padding: "12px 16px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      marginBottom: "4px",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.95rem",
                        color: "#fff",
                      }}
                    >
                      Notifications
                    </div>
                    {(notifications || []).length > 0 && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={clearNotifications}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#a1a1aa",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        Clear All
                      </motion.button>
                    )}
                  </div>
                  {(notifications || []).length === 0 ? (
                    <div
                      style={{
                        padding: "2rem 1rem",
                        textAlign: "center",
                        color: "#a1a1aa",
                        fontSize: "0.85rem",
                      }}
                    >
                      You're all caught up!
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const diffMs = Date.now() - (n.createdAt || Date.now());
                      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      let timeStr = "Just now";
                      if (diffDays === 1) timeStr = "Yesterday";
                      else if (diffDays > 1) timeStr = `${diffDays}d ago`;
                      else if (diffMs > 1000 * 60 * 60) timeStr = `${Math.floor(diffMs / (1000 * 60 * 60))}h ago`;
                      else if (diffMs > 1000 * 60) timeStr = `${Math.floor(diffMs / (1000 * 60))}m ago`;

                      // Rich type config with icons, colors, and backgrounds
                      const typeConfig = {
                        episode_released: { icon: <Tv size={15} />, accent: '#60a5fa', bg: 'rgba(96,165,250,0.06)' },
                        episode_airing: { icon: <Tv size={15} />, accent: '#f97316', bg: 'rgba(249,115,22,0.06)' },
                        movie_added: { icon: <Film size={15} />, accent: '#f43f5e', bg: 'rgba(244,63,94,0.06)' },
                        series_added: { icon: <Tv size={15} />, accent: '#a78bfa', bg: 'rgba(167,139,250,0.06)' },
                        movie_streaming: { icon: <Film size={15} />, accent: '#f43f5e', bg: 'rgba(244,63,94,0.06)' },
                        platform_availability: { icon: <Sparkles size={15} />, accent: '#10b981', bg: 'rgba(16,185,129,0.06)' },
                        weekly_digest: { icon: <Sparkles size={15} />, accent: '#fbbf24', bg: 'rgba(251,191,36,0.06)' },
                        recommendation: { icon: <Sparkles size={15} />, accent: '#818cf8', bg: 'rgba(129,140,248,0.06)' },
                        milestone: { icon: <Sparkles size={15} />, accent: '#fbbf24', bg: 'rgba(251,191,36,0.06)' },
                        welcome: { icon: <Sparkles size={15} />, accent: '#fbbf24', bg: 'rgba(251,191,36,0.06)' },
                        episode: { icon: <Tv size={15} />, accent: '#60a5fa', bg: 'rgba(96,165,250,0.06)' },
                        movie: { icon: <Film size={15} />, accent: '#f43f5e', bg: 'rgba(244,63,94,0.06)' },
                        info: { icon: <Bell size={15} />, accent: '#a1a1aa', bg: 'rgba(255,255,255,0.03)' },
                      };
                      const cfg = typeConfig[n.type] || typeConfig.info;

                      return (
                        <div
                          key={n.id}
                          role={n.link ? "button" : undefined}
                          tabIndex={n.link ? 0 : undefined}
                          onClick={() => {
                            setShowNotifications(false);
                            if (n.link) navigate(n.link);
                          }}
                          onKeyDown={(e) => {
                            if (n.link && (e.key === "Enter" || e.key === " ")) {
                              e.preventDefault();
                              setShowNotifications(false);
                              navigate(n.link);
                            }
                          }}
                          style={{
                            padding: '10px 14px',
                            display: 'flex',
                            gap: '10px',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            cursor: n.link ? 'pointer' : 'default',
                            background: n.isRead ? 'transparent' : cfg.bg,
                            borderLeft: `3px solid ${cfg.accent}`,
                            opacity: n.isRead ? 0.7 : 1,
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            if (n.link) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                          }}
                          onMouseLeave={(e) => {
                            if (n.link) e.currentTarget.style.background = n.isRead ? 'transparent' : cfg.bg;
                          }}
                        >
                          {/* Thumbnail */}
                          {n.image && (
                            <div style={{
                              width: '44px', height: '44px', borderRadius: '8px', flexShrink: 0,
                              overflow: 'hidden', background: '#18181b',
                            }}>
                              <img src={n.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                              <span style={{ color: cfg.accent, flexShrink: 0, display: 'flex' }}>{cfg.icon}</span>
                              <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {n.title}
                              </div>
                              {!n.isRead && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.accent, flexShrink: 0 }} />}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#a1a1aa', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {n.message}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#71717a', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span>{timeStr}</span>
                              {n.platformKey && (
                                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                  <PlatformIcon platform={n.platformKey} xs />
                                </span>
                              )}
                              {n.detail && !n.platform && (
                                <span style={{ color: '#52525b' }}>{n.detail}</span>
                              )}
                            </div>
                          </div>
                        </div>
                    );
                  })
                )}
              </Popover>
          </div>


          {/* Auth Modal */}
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
          />

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

      {/* Mobile Bottom Navigation Bar (Surpassing authentic platforms with persistent UX) */}
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
        <Link
          to="/search"
          className={`bottom-nav-item ${location.pathname === "/search" ? "active" : ""}`}
        >
          <Search size={22} strokeWidth={2} />
          <span>Search</span>
        </Link>
      </div>
    </div>
  );
}

import { ServerWakeupNotification } from "./components/ServerWakeupNotification";
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
                  <HomePage filter="all" title="Trending Across Platforms" />
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
              <Route path="/watchlist" element={<WatchlistPage />} />
              <Route path="/mylist" element={<Navigate to="/watchlist" replace />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/category/:name" element={<CategoryPage />} />
              <Route path="/genre/:genre" element={<GenrePage />} />
              <Route path="/watch/:id/:slug?" element={<TitleDetails />} />
              <Route path="/person/:id/:slug?" element={<PersonDetails />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <Router>
      <ServerWakeupNotification />
      <Loader variant="global" />
      <GlobalShortcuts />
      <Layout>
        <AppRoutes />
      </Layout>
    </Router>
  );
}

export default App;
