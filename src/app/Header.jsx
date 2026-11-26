import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useIsFetching } from "@tanstack/react-query";
import { Search, Settings, ChevronLeft } from "lucide-react";
import { DURATION_2, EASE_2 } from "../constants/motion";
import { useI18n } from "../i18n/index.jsx";
import { useAppAuth } from "../context/auth";
import { usePreferenceValue } from "../context/preferences";
import { useDetailBack } from "../hooks/useDetailView";
import AccountMenu from "./AccountMenu";
import NotificationCenter from "../components/NotificationCenter";
import BrandWordmark from "../components/BrandWordmark";

const SEARCH_DEBOUNCE_MS = 250;

/* ── 2.0 shell ─────────────────────────────────────────────────────────────
   Brand/back stay frozen at the left edge. The top-right expanding `.sq` owns
   search; notifications/settings/account remain reachable from the compact
   utility strip beside it. Navigation itself lives in the bottom pill. */
function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, addSearch } = useAppAuth();
  const { t } = useI18n();
  const osReducedMotion = useReducedMotion();
  const prefReduceMotion = usePreferenceValue("reduceMotion", false);
  const reduceMotion = osReducedMotion || !!prefReduceMotion;
  const detailBack = useDetailBack();

  // Provider pages have their own brand/hero header and no back affordance
  // on purpose; the global arrow must not duplicate one there.
  const isProviderRoute = /^\/provider(?:\/|$)/.test(location.pathname);

  const urlQuery = new URLSearchParams(location.search).get("q") || "";
  const [shellQuery, setShellQuery] = useState(urlQuery);
  const [shellFocused, setShellFocused] = useState(false);
  const shellInputRef = useRef(null);
  const lastShellCommitRef = useRef(urlQuery);
  const shellDebounceRef = useRef(0);
  const isFetchingSearch =
    useIsFetching({ queryKey: ["search", urlQuery], exact: true }) > 0;
  const shellHasText = shellQuery.length > 0;
  const shellLoading =
    Boolean(urlQuery) && shellQuery.trim() === urlQuery && isFetchingSearch;

  /* Settings dropdown (Cinejoy .head-menu) — fixed coords measured off the
     button so the portal is not clipped by the header's paint root. The route
     is part of the state so a navigation retires the menu without an effect. */
  const settingsBtnRef = useRef(null);
  const [accountMenu, setAccountMenu] = useState({ open: false, path: null, pos: null });
  const accountMenuOpen = accountMenu.open && accountMenu.path === location.pathname;

  const measureMenu = useCallback((el) => {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      top: rect.bottom + 10,
      left: Math.max(8, Math.min(rect.right - 240, window.innerWidth - 248)),
    };
  }, []);

  const toggleAccountMenu = useCallback(() => {
    const pos = measureMenu(settingsBtnRef.current);
    setAccountMenu((current) => {
      if (current.open && current.path === location.pathname) {
        return { ...current, open: false };
      }
      return { open: true, path: location.pathname, pos };
    });
  }, [location.pathname, measureMenu]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    let frameId = 0;
    const reposition = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        setAccountMenu((current) =>
          current.open
            ? { ...current, pos: measureMenu(settingsBtnRef.current) }
            : current,
        );
      });
    };
    window.addEventListener("resize", reposition, { passive: true });
    return () => {
      window.removeEventListener("resize", reposition);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [accountMenuOpen, measureMenu]);

  /* Adopt external URL changes (SearchPage input, quick chips, Back/Forward)
     without overwriting a term that is still being typed here. */
  useEffect(() => {
    if (urlQuery === lastShellCommitRef.current) return;
    lastShellCommitRef.current = urlQuery;
    setShellQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => () => {
    if (shellDebounceRef.current) window.clearTimeout(shellDebounceRef.current);
  }, []);

  const commitShellSearch = useCallback(
    (raw, { record = false } = {}) => {
      if (shellDebounceRef.current) {
        window.clearTimeout(shellDebounceRef.current);
        shellDebounceRef.current = 0;
      }
      const trimmed = raw.trim();
      lastShellCommitRef.current = trimmed;
      if (record && trimmed) addSearch(trimmed);

      const params = new URLSearchParams(location.search);
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const nextSearch = params.toString();
      navigate(
        { pathname: "/search", search: nextSearch ? `?${nextSearch}` : "" },
        { replace: location.pathname === "/search" },
      );
    },
    [addSearch, location.pathname, location.search, navigate],
  );

  const handleShellChange = useCallback(
    (event) => {
      const raw = event.target.value;
      setShellQuery(raw);
      if (shellDebounceRef.current) window.clearTimeout(shellDebounceRef.current);
      shellDebounceRef.current = window.setTimeout(() => {
        shellDebounceRef.current = 0;
        commitShellSearch(raw);
      }, SEARCH_DEBOUNCE_MS);
    },
    [commitShellSearch],
  );

  const handleShellKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitShellSearch(shellQuery, { record: true });
      } else if (event.key === "Escape") {
        event.preventDefault();
        setShellQuery("");
        commitShellSearch("");
      }
    },
    [commitShellSearch, shellQuery],
  );

  /* Ctrl/⌘K focuses the shell search. The legacy event still fires so any
     listener keeps working; `source` lets SearchPage avoid stealing focus. */
  useEffect(() => {
    let focusFrame = 0;
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigate({ pathname: "/search", search: location.search });
        if (focusFrame) window.cancelAnimationFrame(focusFrame);
        focusFrame = window.requestAnimationFrame(() => {
          focusFrame = 0;
          const input = shellInputRef.current;
          input?.focus();
          input?.select?.();
          window.dispatchEvent(
            new CustomEvent("streamly:search-focus", { detail: { source: "shell" } }),
          );
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
    };
  }, [navigate, location.search]);

  /* Scrolled is a boolean, so this effect only re-renders on the 50px — React
     no longer tracks the scroll fraction per frame. */
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

  /* Canonical `.glass` pointer glow. Geometry is cached per surface and writes
     are coalesced to one rAF — a blurred surface must not be re-rasterized by
     every pointermove, and getBoundingClientRect() must never be a per-frame
     layout flush on the global move path. */
  useEffect(() => {
    let rects = new WeakMap();
    let frame = 0;
    let activeSurface = null;
    let activeRect = null;
    let pending = null;

    const invalidateRects = () => {
      rects = new WeakMap();
      activeRect = null;
    };

    const applyGlow = () => {
      frame = 0;
      if (!activeSurface || !activeRect || !pending) return;
      activeSurface.style.setProperty("--mx", `${pending.x - activeRect.left}px`);
      activeSurface.style.setProperty("--my", `${pending.y - activeRect.top}px`);
      pending = null;
    };

    const handlePointerMove = (event) => {
      if (!(event.target instanceof Element)) return;
      const surface = event.target.closest(".sq.glass, .tb.glass");
      if (!surface) {
        activeSurface = null;
        activeRect = null;
        pending = null;
        return;
      }
      if (surface !== activeSurface) {
        activeSurface = surface;
        activeRect = rects.get(surface) || null;
        if (!activeRect) {
          activeRect = surface.getBoundingClientRect();
          rects.set(surface, activeRect);
        }
      }
      pending = { x: event.clientX, y: event.clientY };
      if (!frame) frame = window.requestAnimationFrame(applyGlow);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("scroll", invalidateRects, { passive: true });
    window.addEventListener("resize", invalidateRects, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("scroll", invalidateRects);
      window.removeEventListener("resize", invalidateRects);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const shellSearchOpen = shellFocused || shellHasText;

  return (
    <header
      className={`header-row${isScrolled ? " scrolled" : ""}${shellSearchOpen ? " shell-search-open" : ""}`}
    >
      <div className="header-brand-cluster">
        {/* Back arrow on secondary routes; `/watch/*` owns its own 2.0 `.lk`
            back pill. Provider routes own a brand header with no back affordance. */}
        <AnimatePresence mode="wait" initial={false}>
          {location.pathname !== "/" &&
            !location.pathname.startsWith("/watch") &&
            !isProviderRoute && (
            <motion.button
              key="back-btn"
              initial={false}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={false}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      opacity: { duration: DURATION_2.STATE, ease: EASE_2.UI },
                      y: { duration: DURATION_2.STATE, ease: EASE_2.UI },
                      x: { duration: DURATION_2.STATE, ease: EASE_2.UI },
                    }
              }
              type="button"
              className="back-btn"
              aria-label="Go back"
              title="Go back"
              onClick={detailBack}
            >
              <ChevronLeft size={24} strokeWidth={1.5} />
            </motion.button>
          )}
        </AnimatePresence>

        <motion.div
          layout
          transition={reduceMotion ? { duration: 0 } : { duration: DURATION_2.STATE, ease: EASE_2.UI }}
          className="app-brand-link-wrap"
        >
          <Link to="/" className="app-brand-link" aria-label="Streamly home">
            <BrandWordmark className="logo-legible" />
          </Link>
        </motion.div>
      </div>

      <div className="shell-utility-cluster">
        <NotificationCenter />

        <button
          ref={settingsBtnRef}
          type="button"
          className={`nav-icon-btn shell-account-btn${location.pathname === "/settings" ? " nav-icon-btn--active" : ""}${user ? " nav-icon-btn--avatar" : ""}`}
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
            <span className="nav-avatar-initial" aria-hidden="true">
              {(user.email || user.name || "?").trim().charAt(0).toUpperCase()}
            </span>
          ) : (
            <Settings size={18} strokeWidth={2} />
          )}
        </button>
      </div>

      <label
        className={`sq glass shell-search${shellHasText ? " has" : ""}${shellLoading ? " loading" : ""}`}
        onFocus={() => setShellFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setShellFocused(false);
        }}
      >
        <Search size={20} strokeWidth={2} aria-hidden="true" />
        <input
          ref={shellInputRef}
          className="shell-search__input"
          type="search"
          value={shellQuery}
          onChange={handleShellChange}
          onKeyDown={handleShellKeyDown}
          placeholder={t("search.placeholder") || "Search titles"}
          aria-label={t("nav.search")}
          aria-busy={shellLoading}
          autoComplete="off"
          enterKeyHint="search"
          spellCheck="false"
        />
      </label>

      <AccountMenu
        open={accountMenuOpen}
        onClose={() => setAccountMenu((current) => ({ ...current, open: false }))}
        triggerRef={settingsBtnRef}
        position={accountMenu.pos}
      />
    </header>
  );
}

export default Header;
