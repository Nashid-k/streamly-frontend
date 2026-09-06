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
  Play,
  X,
  Menu,
  Bell,
  Tv,
  Keyboard,
  LogOut,
  Film,
  Compass,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import slugify from "slugify";
import { movieService } from "./api/movieService";
import { mapSource } from "./api/platformAdapter";
import { rankSearchResults } from "./utils/searchRanking";
import SearchResultRow from "./components/SearchResultRow";
import { useDebounce } from "./hooks/useDebounce";
import { AnimatePresence, motion } from "framer-motion";
import { useAppAuth } from "./context/AuthContext";

import ErrorBoundary from "./components/ErrorBoundary";

import Loader from "./components/Loader";
import BackToTop from "./components/BackToTop";
import AuthModal from "./components/AuthModal";
import PlatformIcon from "./components/PlatformIcon";
import Popover from "./components/Popover";
import { useScrollRestoration } from "./hooks/useScrollRestoration";
import { useMediaQuery } from "./hooks/useMediaQuery";

const APP_VERSION = __VERSION__ || "1.0.0";

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
  const [query, setQuery] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (window.innerWidth > 768 && searchInputRef.current) {
          searchInputRef.current.focus();
        } else if (mobileInputRef.current) {
          mobileInputRef.current.focus();
        } else {
          navigate("/search");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);
  const debouncedQuery = useDebounce(query, 400);
  const [showDropdown, setShowDropdown] = useState(false);
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
    searchHistory,
    addSearch,
    removeSearch,
    clearSearchHistory,
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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const userMenuRef = useRef(null);
  const notificationsRef = useRef(null);
  const searchRef = useRef(null);
  const mobileSearchRef = useRef(null);
  const mobileInputRef = useRef(null);

  const {
    data: rawResults,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => movieService.searchMovies(debouncedQuery),
    enabled: !!debouncedQuery.trim(),
  });

  const results = useMemo(() => {
    if (!rawResults || !Array.isArray(rawResults.movies)) return [];

    const mapped = rawResults.movies.filter(Boolean).map(mapSource);
    const seen = new Set();
    const unique = mapped.filter((m) => {
      const key = m.tmdbId || m.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Rank by relevance — exact title matches first
    return rankSearchResults(unique, debouncedQuery).slice(0, 10);
  }, [rawResults, debouncedQuery]);

  const error = queryError
    ? "Failed to reach server. Please try again later."
    : null;

  useEffect(() => {
    setShowDropdown(false);
    setQuery("");
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Close menus when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(e.target)
      ) {
        setShowNotifications(false);
      }
      const clickedOutsideDesktop =
        searchRef.current && !searchRef.current.contains(e.target);
      const clickedOutsideMobile =
        mobileSearchRef.current && !mobileSearchRef.current.contains(e.target);
      if (clickedOutsideDesktop && clickedOutsideMobile) {
        setShowDropdown(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowUserMenu(false);
        setShowNotifications(false);
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);
  const isDesktop = useMediaQuery("(min-width: 769px)");

  // Reset selection when results change
  useEffect(() => {
    setSelectedResultIndex(-1);
  }, [results]);

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      if (selectedResultIndex >= 0 && results[selectedResultIndex]) {
        const r = results[selectedResultIndex];
        addSearch(r.title);
        navigate(
          `/watch/${r.id}/${slugify(r.title, { lower: true, strict: true })}`,
        );
        setQuery("");
        setShowDropdown(false);
        setSelectedResultIndex(-1);
      } else if (query.trim()) {
        addSearch(query);
        navigate(`/search?q=${encodeURIComponent(query.trim())}`);
        setQuery("");
        setShowDropdown(false);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedResultIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedResultIndex((prev) => Math.max(prev - 1, -1));
    }
  };

  return (
    <div className="app-container">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {/* Top Navbar */}
      <nav
        className={`navbar${isScrolled ? ' scrolled' : ''}`}
        style={{
          background: isScrolled
            ? "linear-gradient(180deg, rgba(5,5,5,0.97) 0%, rgba(5,5,5,0.95) 100%)"
            : "linear-gradient(180deg, rgba(5,5,5,0.92) 0%, rgba(5,5,5,0.85) 100%)",
          borderBottom: isScrolled
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid rgba(255,255,255,0.06)",
          boxShadow: isScrolled
            ? "0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.5)"
            : "none",
        }}
      >
        <div className="nav-left">
          <Link to="/" className="logo">
            <div className="logo-icon">
              <Play
                size={20}
                fill="currentColor"
                stroke="none"
                style={{ marginLeft: "2px" }}
              />
            </div>
            Streamly
            <span style={{ fontSize: '0.5rem', background: 'linear-gradient(135deg, #f43f5e, #fb923c)', color: '#fff', padding: '2px 6px', borderRadius: '6px', fontWeight: 700, marginLeft: '6px', letterSpacing: '0.05em', verticalAlign: 'super' }}>v{APP_VERSION}</span>
          </Link>

          <div
            className={`nav-links ${mobileMenuOpen ? "nav-links-open" : ""}`}
          >
            {/* Mobile Search */}
            <div className="mobile-only" style={{ marginBottom: "1rem" }}>
              <div
                ref={mobileSearchRef}
                className="search-wrapper mobile-search"
                style={{ position: "relative" }}
              >
                <Search
                  size={18}
                  className="search-icon"
                  onClick={() => {
                    const input =
                      mobileSearchRef.current?.querySelector("input");
                    if (input) input.focus();
                  }}
                  style={{ cursor: "pointer", padding: "10px" }}
                />
                <input
                  ref={mobileInputRef}
                  type="text"
                  className="search-input"
                  placeholder="Search movies, shows... (Cmd+K)"
                  aria-label="Search movies and TV shows"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => {
                    if (query) setShowDropdown(true);
                  }}
                  onKeyDown={handleSearchKeyDown}
                />
                {query && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                      setQuery("");
                      setShowDropdown(false);
                    }}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      color: "#a1a1aa",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "10px",
                    }}
                  >
                    <X size={16} aria-label="Close search" />
                  </motion.button>
                )}

                <Popover
                  isOpen={!!(showDropdown && query)}
                  onClose={() => setShowDropdown(false)}
                  triggerRef={mobileSearchRef}
                  role={null}
                  style={{
                    width: "100%",
                    maxHeight: "65vh",
                    overflowY: "auto",
                  }}
                >
                      {loading ? (
                        <div
                          role="status"
                          aria-busy="true"
                          aria-label="Loading search results"
                          style={{ display: "flex", flexDirection: "column" }}
                        >
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "1rem",
                                padding: "0.75rem 1rem",
                                borderBottom:
                                  "1px solid rgba(255,255,255,0.05)",
                              }}
                            >
                              <div
                                className="skeleton"
                                style={{
                                  width: "50px",
                                  height: "75px",
                                  borderRadius: "4px",
                                }}
                              ></div>
                              <div
                                style={{
                                  flex: 1,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "8px",
                                }}
                              >
                                <div
                                  className="skeleton"
                                  style={{
                                    width: "60%",
                                    height: "1rem",
                                    borderRadius: "4px",
                                  }}
                                ></div>
                                <div
                                  className="skeleton"
                                  style={{
                                    width: "30%",
                                    height: "0.8rem",
                                    borderRadius: "4px",
                                  }}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : error ? (
                        <div
                          style={{
                            padding: "3rem",
                            textAlign: "center",
                            color: "#ef4444",
                          }}
                        >
                          {error}
                        </div>
                      ) : results.length > 0 ? (
                        <div
                          style={{ display: "flex", flexDirection: "column" }}
                        >
                          <div role="listbox" aria-label="Search results">
                          {results.map((r, i) => (
                            <SearchResultRow
                              key={`${r.id}-${i}`}
                              r={r}
                              i={i}
                              selectedResultIndex={selectedResultIndex}
                              setSelectedResultIndex={setSelectedResultIndex}
                              roleOption
                              onClick={() => {
                                addSearch(r.title); // Fix #21: save to history on click
                                navigate(
                                  `/watch/${r.id}/${slugify(r.title, { lower: true, strict: true })}`,
                                );
                                setQuery("");
                                setShowDropdown(false);
                                setMobileMenuOpen(false);
                              }}
                            />
                          ))}
                          </div>
                          {/* Keyboard nav hint */}
                          <div
                            style={{
                              padding: "0.5rem 1rem",
                              display: "flex",
                              gap: "1rem",
                              borderTop: "1px solid rgba(255,255,255,0.05)",
                              borderBottom: "1px solid rgba(255,255,255,0.05)",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "0.7rem",
                                color: "#52525b",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <kbd
                                style={{
                                  background: "rgba(255,255,255,0.08)",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  borderRadius: "3px",
                                  padding: "1px 5px",
                                  fontSize: "0.65rem",
                                }}
                              >
                                ↑↓
                              </kbd>{" "}
                              navigate
                            </span>
                            <span
                              style={{
                                fontSize: "0.7rem",
                                color: "#52525b",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <kbd
                                style={{
                                  background: "rgba(255,255,255,0.08)",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  borderRadius: "3px",
                                  padding: "1px 5px",
                                  fontSize: "0.65rem",
                                }}
                              >
                                ↵
                              </kbd>{" "}
                              select
                            </span>
                          </div>
                          <button
                            type="button"
                            className="menu-item"
                            style={{ textAlign: "center", color: "var(--accent-secondary)", fontWeight: 600, borderTop: "1px solid rgba(255,255,255,0.08)" }}
                            onClick={() => {
                              addSearch(query); // Fix #21: save to history on mobile see-all
                              navigate(
                                `/search?q=${encodeURIComponent(query)}`,
                              );
                              setQuery("");
                              setShowDropdown(false);
                              setMobileMenuOpen(false);
                            }}
                          >
                            See all results for "{query}" →
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: "3rem",
                            textAlign: "center",
                            color: "#a1a1aa",
                          }}
                        >
                          No results found for "{query}"
                        </div>
                      )}
                  </Popover>
              </div>
            </div>
            <Link
              onClick={() => setMobileMenuOpen(false)}
              to="/"
              className={`nav-item ${location.pathname === "/" ? "active" : ""}`}
            >
              Home
            </Link>
            <Link
              onClick={() => setMobileMenuOpen(false)}
              to="/series"
              className={`nav-item ${location.pathname.includes("/series") ? "active" : ""}`}
            >
              TV Shows
            </Link>
            <Link
              onClick={() => setMobileMenuOpen(false)}
              to="/movies"
              className={`nav-item ${location.pathname.includes("/movies") ? "active" : ""}`}
            >
              Movies
            </Link>
            <Link
              onClick={() => setMobileMenuOpen(false)}
              to="/new"
              className={`nav-item ${location.pathname.includes("/new") ? "active" : ""}`}
            >
              New & Popular
            </Link>
            <Link
              onClick={() => setMobileMenuOpen(false)}
              to="/anime"
              className={`nav-item ${location.pathname.includes("/anime") ? "active" : ""}`}
            >
              Anime
            </Link>
            <Link
              onClick={() => setMobileMenuOpen(false)}
              to="/watchlist"
              className={`nav-item ${location.pathname === "/watchlist" ? "active" : ""}`}
            >
              My List
            </Link>
          </div>
        </div>

        <div className="nav-right">
          <div
            ref={searchRef}
            className="search-wrapper desktop-only"
            style={{ position: "relative" }}
          >
            <Search
              size={18}
              className="search-icon"
              onClick={() => {
                const input = searchRef.current?.querySelector("input");
                if (input) input.focus();
              }}
              style={{ cursor: "pointer", padding: "10px" }}
            />
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Search movies, shows... (Cmd+K)"
              aria-label="Search movies and TV shows"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={handleSearchKeyDown}
            />
            {query && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  setQuery("");
                  setShowDropdown(false);
                }}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "#a1a1aa",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px",
                }}
              >
                <X size={16} aria-label="Close search" />
              </motion.button>
            )}

            <Popover
              isOpen={!!(showDropdown && (query || (searchHistory && searchHistory.length > 0)))}
              onClose={() => setShowDropdown(false)}
              triggerRef={searchRef}
              role={null}
              style={{
                width: isDesktop ? "min(450px, calc(100vw - 2rem))" : "100%",
                maxHeight: "65vh",
                overflowY: "auto",
              }}
            >
                    {!query && searchHistory && searchHistory.length > 0 ? (
                      <div style={{ padding: "0.75rem" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "0.5rem",
                            padding: "0 0.25rem",
                          }}
                        >
                          <span className="label-eyebrow">
                            Recent Searches
                          </span>
                          <button
                            onClick={() => clearSearchHistory()}
                            className="menu-item"
                            style={{
                              fontSize: "0.75rem",
                              padding: "2px 6px",
                              width: "auto",
                            }}
                          >
                            Clear all
                          </button>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.5rem",
                          }}
                        >
                          {searchHistory.slice(0, 8).map((term) => (
                            <motion.button
                              key={term}
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              className="chip"
                              onClick={() => {
                                setQuery(term);
                                addSearch(term);
                                navigate(
                                  `/search?q=${encodeURIComponent(term)}`,
                                );
                                setShowDropdown(false);
                              }}
                            >
                              <span>{term}</span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSearch(term);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    removeSearch(term);
                                  }
                                }}
                                style={{
                                  color: "var(--text-muted)",
                                  fontSize: "0.75rem",
                                  display: "flex",
                                  alignItems: "center",
                                  marginLeft: "2px",
                                }}
                              >
                                ×
                              </span>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    ) : loading ? (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "1rem",
                              padding: "0.75rem 1rem",
                              borderBottom: "1px solid rgba(255,255,255,0.05)",
                            }}
                          >
                            <div
                              className="skeleton"
                              style={{
                                width: "50px",
                                height: "75px",
                                borderRadius: "4px",
                              }}
                            ></div>
                            <div
                              style={{
                                flex: 1,
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                              }}
                            >
                              <div
                                className="skeleton"
                                style={{
                                  width: "60%",
                                  height: "1rem",
                                  borderRadius: "4px",
                                }}
                              ></div>
                              <div
                                className="skeleton"
                                style={{
                                  width: "30%",
                                  height: "0.8rem",
                                  borderRadius: "4px",
                                }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : error ? (
                      <div
                        style={{
                          padding: "3rem",
                          textAlign: "center",
                          color: "#ef4444",
                        }}
                      >
                        {error}
                      </div>
                    ) : results.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {results.map((r, i) => (
                          <SearchResultRow
                            key={`${r.id}-${i}`}
                            r={r}
                            i={i}
                            selectedResultIndex={selectedResultIndex}
                            setSelectedResultIndex={setSelectedResultIndex}
                            onClick={() => {
                              addSearch(r.title); // Fix #21: save to history on desktop click
                              navigate(
                                `/watch/${r.id}/${slugify(r.title, { lower: true, strict: true })}`,
                              );
                              setQuery("");
                              setShowDropdown(false);
                              setMobileMenuOpen(false);
                            }}
                          />
                        ))}
                        {/* Keyboard nav hint */}
                        <div
                          style={{
                            padding: "0.5rem 1rem",
                            display: "flex",
                            gap: "1rem",
                            borderTop: "1px solid rgba(255,255,255,0.05)",
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "#52525b",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <kbd
                              style={{
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: "3px",
                                padding: "1px 5px",
                                fontSize: "0.65rem",
                              }}
                            >
                              ↑↓
                            </kbd>{" "}
                            navigate
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "#52525b",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <kbd
                              style={{
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: "3px",
                                padding: "1px 5px",
                                fontSize: "0.65rem",
                              }}
                            >
                              ↵
                            </kbd>{" "}
                            select
                          </span>
                        </div>
                        {/* See all results link */}
                        <button
                          type="button"
                          className="menu-item"
                          style={{ textAlign: "center", color: "var(--accent-secondary)", fontWeight: 600, borderTop: "1px solid rgba(255,255,255,0.08)" }}
                          onClick={() => {
                            addSearch(query);
                            navigate(`/search?q=${encodeURIComponent(query)}`);
                            setQuery("");
                            setShowDropdown(false);
                            setMobileMenuOpen(false);
                          }}
                        >
                          See all results for "{query}" →
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: "3rem",
                          textAlign: "center",
                          color: "#a1a1aa",
                        }}
                      >
                        No results found for "{query}"
</div>
                      )}
                  </Popover>
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

          {/* User Avatar with Dropdown */}
          <div ref={userMenuRef} style={{ position: "relative" }}>
            <div
              className="user-avatar"
              role="button"
              tabIndex={0}
              aria-haspopup="menu"
              aria-expanded={user ? showUserMenu : undefined}
              aria-label={user ? "User menu" : "Sign In"}
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
              title={user ? user.displayName || user.email : "Sign In"}
              style={{ cursor: "pointer", position: "relative" }}
            >
              {user ? (
                <div
                  className="user-avatar"
                  style={{
                    borderRadius: "50%",
                    background: "var(--accent-gradient)",
                  }}
                >
                  {(user.displayName || user.email || "?")[0].toUpperCase()}
                </div>
              ) : (
                <User size={20} aria-label="Sign In" />
              )}
            </div>
            <Popover
              isOpen={!!(showUserMenu && user)}
              onClose={() => setShowUserMenu(false)}
              triggerRef={userMenuRef}
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

          {/* Auth Modal */}
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
          />

          {/* Hamburger button for mobile */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="hamburger-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              background: "transparent",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              padding: "10px",
              marginLeft: "0.5rem",
            }}
          >
            {mobileMenuOpen ? (
              <X size={24} aria-label="Close menu" />
            ) : (
              <Menu size={24} aria-label="Open menu" />
            )}
          </motion.button>
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
        <Link
          to="/"
          className={`bottom-nav-item ${location.pathname === "/" ? "active" : ""}`}
        >
          <Home size={22} />
          <span>Home</span>
        </Link>
        <Link
          to="/movies"
          className={`bottom-nav-item ${location.pathname === "/movies" ? "active" : ""}`}
        >
          <Film size={22} />
          <span>Movies</span>
        </Link>
        <Link
          to="/new"
          className={`bottom-nav-item ${location.pathname === "/new" ? "active" : ""}`}
        >
          <Sparkles size={22} />
          <span>New</span>
        </Link>
        <Link
          to="/series"
          className={`bottom-nav-item ${location.pathname === "/series" ? "active" : ""}`}
        >
          <Tv size={22} />
          <span>TV Shows</span>
        </Link>
        <Link
          to="/anime"
          className={`bottom-nav-item ${location.pathname === "/anime" ? "active" : ""}`}
        >
          <Compass size={22} />
          <span>Anime</span>
        </Link>
        <Link
          to="/search"
          className={`bottom-nav-item ${location.pathname === "/search" ? "active" : ""}`}
        >
          <Search size={22} />
          <span>Search</span>
        </Link>
        <Link
          to="/watchlist"
          className={`bottom-nav-item ${location.pathname === "/watchlist" ? "active" : ""}`}
        >
          <Bookmark size={22} />
          <span>My List</span>
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
              <Route
                path="/new"
                element={
                  <HomePage filter="new" title="New & Popular Arrivals" />
                }
              />
              <Route
                path="/anime"
                element={<HomePage filter="anime" title="Anime Collection" />}
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
