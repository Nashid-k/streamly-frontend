import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import {
  User,
  Palette,
  Play,
  Server,
  Captions,
  Bell,
  LayoutGrid,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Search,
  GripVertical,
  RotateCcw,
  LogOut,
  Bookmark,
  Clock,
  SlidersHorizontal,
} from "lucide-react";
import SEO from "../components/SEO";
import PlayerPreview from "../components/PlayerPreview.jsx";
import AmbientBackground from "../components/AmbientBackground";
import { usePreferences } from "../context/preferences";
import { useAppAuth, useSyncStatus } from "../context/auth";
import GoogleSignInButton, { GoogleLogoIcon } from "../components/GoogleSignInButton.jsx";
import { useToast } from "../components/Toast.jsx";
import { useConfirmDialog } from "../components/ConfirmDialog.jsx";
import { logDebug } from "../utils/debugLogger";
import { useI18n } from "../i18n";

const THEMES = [
  {
    id: "default",
    name: "Default (Streamly)",
    primary: "#95ff50",
    secondary: "#5ce21c",
  },
  {
    id: "emerald",
    name: "Cinejoy Emerald",
    primary: "#95ff50",
    secondary: "#43861e",
  },
  {
    id: "amethyst",
    name: "Amethyst Violet",
    primary: "#c084fc",
    secondary: "#7c3aed",
  },
  {
    id: "ocean",
    name: "Ocean Cyan",
    primary: "#22d3ee",
    secondary: "#2563eb",
  },
  {
    id: "crimson",
    name: "Crimson Ruby",
    primary: "#f87171",
    secondary: "#dc2626",
  },
  {
    id: "solar",
    name: "Solar Amber",
    primary: "#fbbf24",
    secondary: "#d97706",
  },
];

const LANGUAGES = [
  { code: "en", name: "English", flag: "flags/us.svg" },
  { code: "es", name: "Spanish", flag: "flags/es.svg" },
  { code: "fr", name: "French", flag: "flags/fr.svg" },
  { code: "de", name: "German", flag: "flags/de.svg" },
  { code: "it", name: "Italian", flag: "flags/it.svg" },
  { code: "pt", name: "Portuguese", flag: "flags/br.svg" },
  { code: "ja", name: "Japanese", flag: "flags/jp.svg" },
  { code: "ko", name: "Korean", flag: "flags/kr.svg" },
  { code: "hi", name: "Hindi", flag: "flags/in.svg" },
  { code: "ar", name: "Arabic", flag: "flags/sa.svg" },
];

/* Country flag with an offline-safe fallback: if the local SVG can't load we
   swap in a tiny letter chip instead of a broken-image box. External flag
   CDNs are unreliable behind blocking ISPs, so the flags ship with the app. */
function LanguageFlag({ src, code, className }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-[3px] bg-white/10 text-[8px] font-bold tracking-wide text-white/80 ${className}`}
        aria-hidden="true"
      >
        {code.toUpperCase()}
      </span>
    );
  }
  return (
    <img
      alt=""
      className={className}
      src={src}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

const SEEK_TIMES = [
  { value: 5, label: "5 seconds" },
  { value: 10, label: "10 seconds" },
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
];

const SUBTITLE_FONTS = [
  { id: "cinejoy", name: "Cinejoy", family: "'Inter', sans-serif" },
  { id: "netflix", name: "Netflix", family: "'Arial', sans-serif" },
  { id: "montserrat", name: "Montserrat", family: "'Montserrat', sans-serif" },
];

const SUBTITLE_COLORS = [
  { name: "White", value: "#ffffff" },
  { name: "Yellow", value: "#ffff00" },
  { name: "Cyan", value: "#00ffff" },
  { name: "Magenta", value: "#ff00ff" },
  { name: "Emerald", value: "#95ff50" },
];

/* Mirrors DEFAULT_PREFERENCES.serverOrder (plain Server 1 … Server 8
   labels). Kept local so the Settings page renders before the provider
   resolves; the adapter owns the authoritative list. */
const DEFAULT_SERVER_ORDER = [
  "Server 1",
  "Server 2",
  "Server 3",
  "Server 4",
  "Server 5",
  "Server 6",
  "Server 7",
  "Server 8",
];

const TABS = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "account", label: "Account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "playback", label: "Playback", icon: Play },
  { id: "servers", label: "Servers", icon: Server },
  { id: "subtitles", label: "Subtitles", icon: Captions },
  { id: "notifications", label: "Notifications", icon: Bell },
];

/* Search index for the settings filter. Every term a user can see on the
   screen must appear here, otherwise filtering looks broken. The value is a
   plain lowercase "haystack" per section; `visibleSection` tokenises the query
   and requires every word to be present, so multi-word searches work.
   When copy changes in a section, update its haystack here in the same edit
   (the unit test `search resolves real on-screen wording` guards the common
   terms). */
const SECTION_SEARCH_TERMS = {
  account: [
    "account sign in signed out sync settings watch progress across devices",
    "profile library synchronized google continue with google",
    "cloud sync cloud database connected syncing sync now last synced",
    "my watchlist saved movies television series view list",
    "watch history recently watched movies shows progress view history",
    "keyboard touch shortcuts player gestures swipes hotkeys quick actions open guide",
  ].join(" "),
  appearance: [
    "appearance look theme color palette interface default streamly",
    "cinejoy emerald amethyst violet ocean cyan crimson ruby solar amber",
    "custom accent pick any color customize",
    "episode view style carousel rails grids lists series pages",
    "detail view type full info page netflix-style quick modal page modal",
    "use image logos movie series titles image logos",
    "trailers play trailers automatically detail pages hover previews",
    "spoiler-free mode hide information episodes",
    "reduce motion reduce effects",
    "high-quality thumbnails stream higher resolution artwork",
  ].join(" "),
  playback: [
    "playback player behaves autoplay automatically play next episode ends",
    "auto skip intro jump past intro skip intro button",
    "seek time skip forwards backwards seconds",
    "auto subtitles preferred language available",
    "default language subtitle language auto-select",
    "mute trailer audio trailers sound off",
  ].join(" "),
  servers: [
    "server order drag handle sources tried first title loads priority stream",
    "reset server 1 server 2 fast server 3 hd server 4 backup",
    "server 5 vidcore server 6 peachify server 7 vidup server 8 smashy",
  ].join(" "),
  subtitles: [
    "subtitles readability customization font cinejoy netflix montserrat",
    "text size adjust subtitle size display",
    "text color high-contrast subtitle color white yellow cyan magenta emerald",
    "background blur legibility soft glow preview",
  ].join(" "),
  notifications: [
    "notifications in-app status updates scrobble confirmations activity",
    "show in-app notifications brief status toasts items added watchlist servers change progress saved alerts toast popup banner",
  ].join(" "),
  reset: [
    "reset all preferences factory reset restore theme playback preferences",
    "factory defaults clears custom themes subtitle styling server order danger",
  ].join(" "),
};

// jsdom and some older browsers expose no scrollIntoView; never crash on it.
function scrollIntoViewIfSupported(element, options) {
  if (element && typeof element.scrollIntoView === "function") {
    element.scrollIntoView(options);
  }
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`toggle${checked ? " toggle-on" : ""}`}
    >
      <span className="toggle-dot" />
    </button>
  );
}

function SegmentControl({ options, value, onChange, label }) {
  const groupRef = useRef(null);
  const sliderRef = useRef(null);
  const btnRefs = useRef([]);

  const valueOf = (opt) => (typeof opt === "string" ? opt : opt.id);

  const positionSlider = () => {
    const group = groupRef.current;
    const slider = sliderRef.current;
    if (!group || !slider) return;
    const activeBtn = group.querySelector(".segment-btn.segment-active");
    if (!activeBtn) return;
    // Round to whole pixels so the pill never sits on a half-pixel seam.
    slider.style.left = `${Math.round(activeBtn.offsetLeft)}px`;
    slider.style.width = `${Math.round(activeBtn.offsetWidth)}px`;
  };

  // Cinejoy animated segment slider: the white/accent pill slides to the
  // active option instead of re-drawing each button background. Laid out
  // pre-paint so it never animates in from the left on mount, and kept in
  // sync with the group's real size via ResizeObserver (font load, resize,
  // label wrap).
  useLayoutEffect(() => {
    positionSlider();
    const group = groupRef.current;
    if (!group || typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(positionSlider);
    observer.observe(group);
    return () => observer.disconnect();
  }, [value, options]);

  const activeIndex = options.findIndex((opt) => valueOf(opt) === value);

  // ARIA radiogroup contract: Arrow keys move selection (and focus), roving
  // tabindex keeps the group a single tab stop.
  const selectAndFocus = (index) => {
    const next = (index + options.length) % options.length;
    onChange(valueOf(options[next]));
    btnRefs.current[next]?.focus();
  };

  const handleKeyDown = (e) => {
    const current = activeIndex < 0 ? 0 : activeIndex;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      selectAndFocus(current + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      selectAndFocus(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      selectAndFocus(0);
    } else if (e.key === "End") {
      e.preventDefault();
      selectAndFocus(options.length - 1);
    }
  };

  return (
    <div
      ref={groupRef}
      className="segment"
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
    >
      <div ref={sliderRef} className="segment-slider" aria-hidden="true" />
      {options.map((opt, i) => {
        const id = valueOf(opt);
        const name = typeof opt === "string" ? opt : opt.name;
        const active = value === id;
        return (
          <button
            key={id}
            ref={(el) => { btnRefs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(id)}
            className={`segment-btn${active ? " segment-active" : ""}`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

function SettingRow({ title, description, children, highlight = false }) {
  return (
    <div className={`setting-row${highlight ? " bg-white/[0.04] rounded-xl px-3" : ""}`}>
      <div className="setting-meta">
        <span className="setting-title">{title}</span>
        {description && <span className="setting-desc">{description}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

// Drag-and-drop server priority list. Pointer dragging starts from the grip
// handle (mouse + touch via framer-motion Reorder); keyboard users reorder
// with ArrowUp/ArrowDown on a focused row. No up/down arrow buttons.
function ServerOrderList({ list, onReorder, onMoveKeyboard }) {
  const dragControls = useDragControls();
  return (
    <Reorder.Group
      axis="y"
      values={list}
      onReorder={onReorder}
      className="order-list"
      role="list"
      aria-label="Server priority order"
    >
      {list.map((srv, idx) => (
        <Reorder.Item
          key={srv}
          value={srv}
          dragListener={false}
          dragControls={dragControls}
          whileDrag={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className="order-item"
          role="listitem"
          aria-posinset={idx + 1}
          aria-setsize={list.length}
          aria-label={`${srv}, priority ${idx + 1} of ${list.length}. Press arrow up or down to reorder.`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onMoveKeyboard(idx, -1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              onMoveKeyboard(idx, 1);
            }
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="order-grip order-grip--drag"
              tabIndex={-1}
              aria-hidden="true"
              title="Drag to reorder"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <GripVertical className="w-4 h-4" />
            </span>
            <span className="w-6 h-6 rounded-full bg-white/10 text-[11px] font-bold flex items-center justify-center text-white/80 shrink-0">
              {idx + 1}
            </span>
            <span className="order-name">{srv}</span>
          </div>
          <span className="order-hint" aria-hidden="true">
            {idx === 0 ? "Default" : `Priority ${idx + 1}`}
          </span>
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.id === initialTab) ? initialTab : "all",
  );
  const [query, setQuery] = useState("");
  // Only one menu may be open at a time: null | "theme" | "seek" | "lang".
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [signInTab, setSignInTab] = useState("signin");

  // Auth / Accounts state — the context is the SINGLE source of truth for the
  // profile. This page previously kept a shadow `localUser` copy in useState
  // and double-wrote streamly_user with different defaults (user@streamly.io,
  // no picture) than AuthContext (viewer@streamly.io, picture:""), so context
  // state and storage diverged until reload.
  const auth = useAppAuth();
  const user = auth?.user;
  const { syncStatus, lastSyncedAt } = useSyncStatus();

  const {
    // Existing
    autoplay,
    muteTrailers,
    hdThumbs,
    reduceMotion,
    notifications,
    // Appearance
    theme = "default",
    accentSeed = null,
    episodeViewStyle = "carousel",
    detailViewType = "page",
    useImageLogos = true,
    trailers = true,
    spoilerFreeMode = false,
    // Playback
    autoSkipIntro = false,
    seekTime = 10,
    autoSubtitles = true,
    defaultLanguage = "en",
    // Servers
    serverOrder = DEFAULT_SERVER_ORDER,
    // Subtitles (live-controls the Subtitles section below)
    subtitleFont = "cinejoy",
    subtitleSize = 100,
    subtitleColor = "#ffffff",
    // Setter
    setPreference,
    resetPreferences,
  } = usePreferences();

  const { confirmDialog, ConfirmDialogRenderer } = useConfirmDialog();

  const q = useMemo(() => query.trim().toLowerCase(), [query]);

  const activeTheme = useMemo(() => {
  if (theme === "custom" && accentSeed) {
    return {
      id: "custom",
      name: "Custom Accent",
      primary: accentSeed,
      secondary: accentSeed,
    };
  }
  return THEMES.find((t) => t.id === theme) || THEMES[0];
}, [theme, accentSeed]);

  const activeLang = useMemo(
    () => LANGUAGES.find((l) => l.code === defaultLanguage) || LANGUAGES[0],
    [defaultLanguage],
  );

  // Dropdown plumbing. Each trigger gets its own wrapper + trigger ref so an
  // outside click only closes that menu, and only one menu can be open at a
  // time (the shared state is a single name, not three booleans).
  const sectionsTopRef = useRef(null);
  const themeWrapRef = useRef(null);
  const seekWrapRef = useRef(null);
  const langWrapRef = useRef(null);
  const themeTriggerRef = useRef(null);
  const seekTriggerRef = useRef(null);
  const langTriggerRef = useRef(null);
  const loginPanelRef = useRef(null);
  const dropdownWrapRefs = { theme: themeWrapRef, seek: seekWrapRef, lang: langWrapRef };
  const dropdownTriggerRefs = {
    theme: themeTriggerRef,
    seek: seekTriggerRef,
    lang: langTriggerRef,
  };

  const toggleDropdown = (name) =>
    setOpenDropdown((current) => (current === name ? null : name));

  const selectFromDropdown = (name) => {
    setOpenDropdown(null);
    dropdownTriggerRefs[name]?.current?.focus();
  };

  // Outside click / Escape closes the open menu. Escape also returns focus to
  // the trigger so keyboard users are not dropped back at <body>.
  useEffect(() => {
    if (!openDropdown) return undefined;
    const wrap = dropdownWrapRefs[openDropdown]?.current;
    const handleOutsideClick = (e) => {
      if (wrap && !wrap.contains(e.target)) setOpenDropdown(null);
    };
    const handleEscape = (e) => {
      if (e.key !== "Escape") return;
      setOpenDropdown(null);
      dropdownTriggerRefs[openDropdown]?.current?.focus();
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDropdown]);

  // Move focus onto the active option when a popup list opens, so Arrow keys
  // work immediately and screen readers announce the listbox.
  useEffect(() => {
    if (!openDropdown) return undefined;
    const wrap = dropdownWrapRefs[openDropdown]?.current;
    if (!wrap) return undefined;
    const target =
      wrap.querySelector('[role="option"][aria-selected="true"]') ||
      wrap.querySelector('[role="option"]');
    target?.focus?.();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDropdown]);

  // Roving focus inside an open menu: Up/Down/Home/End move between options,
  // Escape closes and restores the trigger. Enter/Space activate the focused
  // <button> natively.
  const handleMenuKeyDown = (e) => {
    const panel = e.currentTarget;
    if (e.key === "Escape") {
      e.preventDefault();
      const name = panel.id.replace("-menu", "");
      setOpenDropdown(null);
      dropdownTriggerRefs[name]?.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const options = [...panel.querySelectorAll('[role="option"]')];
    if (!options.length) return;
    e.preventDefault();
    const current = options.indexOf(document.activeElement);
    let next;
    if (e.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % options.length;
    else if (e.key === "ArrowUp") {
      next = current < 0 ? options.length - 1 : (current - 1 + options.length) % options.length;
    } else if (e.key === "Home") next = 0;
    else next = options.length - 1;
    options[next]?.focus();
  };

  // Lock body scroll while the sign-in modal is open, move focus into the
  // panel, trap Tab inside it, allow Escape to dismiss, and return focus to
  // the element that opened it on close.
  const anyModalOpen = showSignInModal;
  useEffect(() => {
    if (!anyModalOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    const prevActive = document.activeElement;
    document.body.style.overflow = "hidden";

    const focusables = () => {
      const panel = loginPanelRef.current;
      if (!panel) return [];
      return [
        ...panel.querySelectorAll(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ),
      ].filter((el) => !el.disabled && !el.hidden);
    };

    const items = focusables();
    (items[0] || loginPanelRef.current)?.focus?.();

    const handleKey = (e) => {
      if (e.key === "Escape") {
        setShowSignInModal(false);
        return;
      }
      if (e.key !== "Tab") return;
      const panel = loginPanelRef.current;
      const items = focusables();
      if (!panel || items.length === 0) {
        e.preventDefault();
        panel?.focus?.();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKey);
      if (prevActive instanceof HTMLElement) prevActive.focus();
    };
  }, [anyModalOpen]);

  const openShortcuts = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true }));
  };

  // Tabs are filters: "All" shows every section, any other tab isolates one.
  // The active tab lives in the URL (?tab=servers) so it survives refresh and
  // is shareable. After switching, bring the sections list into view —
  // honouring the Reduce Motion preference, which the plain CSS media query
  // can't see.
  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId }, { replace: true });
    const prefersReduced =
      reduceMotion || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    requestAnimationFrame(() => {
      scrollIntoViewIfSupported(sectionsTopRef.current, {
        behavior: prefersReduced ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  // Keep the tab in sync when the user navigates back/forward through the URL.
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab !== activeTab) {
      setActiveTab(TABS.some((t) => t.id === tab) ? tab : "all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Server reordering — drag-and-drop (mouse + touch via Reorder) and
  // keyboard (ArrowUp/ArrowDown on a focused row) land here. The order is
  // the single source of truth for TitleDetails + CustomVideoPlayer.
  const serverList = Array.isArray(serverOrder) && serverOrder.length > 0
    ? serverOrder
    : DEFAULT_SERVER_ORDER;

  const reorderServers = (next) => {
    if (!Array.isArray(next) || next.length === 0) return;
    setPreference("serverOrder", [...next]);
    logDebug("settings", "Server order updated.", { order: next });
  };

  const moveServerKeyboard = (index, dir) => {
    const current = [...serverList];
    const target = index + dir;
    if (target < 0 || target >= current.length) return;
    const [item] = current.splice(index, 1);
    current.splice(target, 0, item);
    reorderServers(current);
  };

  const resetServerOrder = () => {
    setPreference("serverOrder", [...DEFAULT_SERVER_ORDER]);
    toast({
      type: "info",
      title: t("settings.toasts.serversReset"),
      message: t("settings.servers.resetOrderToast"),
    });
  };

  const handleResetAllPreferences = async () => {
    const confirmed = await confirmDialog({
      title: t("settings.reset.confirmTitle"),
      message: t("settings.reset.confirmMessage"),
      confirmLabel: t("settings.reset.confirmLabel"),
      cancelLabel: t("settings.reset.cancelLabel"),
    });
    if (!confirmed) return;
    resetPreferences?.();
    toast({
      type: "success",
      title: t("settings.toasts.preferencesReset"),
      message: t("settings.reset.successToast"),
    });
  };

  // Modal Sign-in actions
  const handleSignIn = (name, email) => {
    auth?.loginAsGuest(name, email);
    setShowSignInModal(false);
    toast({
      type: "success",
      title: t("settings.toasts.signedIn"),
      message: t("settings.account.signedInToast", {
        name: name || t("settings.account.defaultName"),
      }),
    });
  };

  const handleSignOut = () => {
    auth?.logout();
    toast({
      type: "info",
      title: t("settings.toasts.signedOut"),
      message: t("settings.toasts.signedOutMsg"),
    });
  };

  // A section shows when the active tab selects it ("All" shows everything)
  // AND the search query matches its data-driven index. The Reset card keeps
  // its Account/All placement but joins search and the empty state so the
  // page never shows "no matches" next to a visible card.
  const matchesSearch = (id) => {
    if (!q) return true;
    const haystack = (SECTION_SEARCH_TERMS[id] || "").toLowerCase();
    return q
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => haystack.includes(token));
  };

  const inAccountScope = activeTab === "all" || activeTab === "account";

  const sectionVisible = {
    account: inAccountScope && matchesSearch("account"),
    appearance: (activeTab === "all" || activeTab === "appearance") && matchesSearch("appearance"),
    playback: (activeTab === "all" || activeTab === "playback") && matchesSearch("playback"),
    servers: (activeTab === "all" || activeTab === "servers") && matchesSearch("servers"),
    subtitles: (activeTab === "all" || activeTab === "subtitles") && matchesSearch("subtitles"),
    notifications: (activeTab === "all" || activeTab === "notifications") && matchesSearch("notifications"),
    reset: inAccountScope && matchesSearch("reset"),
  };
  const visibleCount = Object.values(sectionVisible).filter(Boolean).length;
  const nothingVisible = visibleCount === 0;
  const liveSummary =
    visibleCount === 0
      ? t("settings.noSections")
      : visibleCount === 1
      ? t("settings.sectionsShownOne")
      : t("settings.sectionsShownMany", { n: visibleCount });

  return (
    <div className="settings-page min-h-screen" style={{ position: "relative" }}>
      <SEO title="Settings - Streamly" description="Configure player, servers, appearance, subtitles and accounts." />
      {/* Visually-hidden results live region: announces search/tab filtering
          to screen readers without stealing focus or scroll position. */}
      <p className="sr-only" role="status" aria-live="polite">{liveSummary}</p>
      {/* Ambient liquid backdrop — the exact movies/series/my-list background */}
      <AmbientBackground fallback />
      <div className="settings-page__glow" aria-hidden="true" />

      <div className="discovery-page relative z-10">
        {/* Header — discovery-page block: same scale, glow and layout as the
            movies/series/my-list pages (big title, subtitle, frosted pills). */}
        <header className="relative mx-auto max-w-[1600px] pt-24 pb-8 px-4 md:px-10 lg:px-14">
          <div className="relative pt-12 pb-6 px-2 md:px-4">
            <div className="flex flex-col xl:flex-row gap-8 xl:gap-10 items-start xl:items-end justify-between">
              <div className="max-w-xl">
                <button
                  type="button"
                  onClick={() => (location.key === "default" ? navigate("/") : navigate(-1))}
                  className="group flex items-center gap-1.5 text-sm font-medium text-white/60 transition-colors mb-4 hover:text-white/90"
                >
                  <ChevronLeft
                    size={15}
                    className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
                  />
                  {t("common.back")}
                </button>
                <div className="flex items-center gap-3">
                  <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white drop-shadow-lg">
                    {t("settings.title")}
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[0.7rem] font-medium text-white/60">
                    {visibleCount === 1
                      ? t("settings.sectionCountOne")
                      : t("settings.sectionCountMany", { n: visibleCount })}
                  </span>
                </div>
                <p className="mt-3 text-lg text-white/70 font-medium leading-relaxed">
                  {t("settings.subtitle")}
                </p>
              </div>

              {/* Toolbar — frosted search capsule + section pills, the same
                  controls as the movies/series/my-list pages */}
              <div className="flex flex-col items-stretch gap-3 w-full xl:w-auto">
                <div className="flex items-center gap-2 w-full md:w-72 px-3 md:px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-md transition-all duration-300 focus-within:border-[#95ff50]/40 min-w-0">
                  <Search size={14} className="w-4 h-4 shrink-0 text-white/40" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("settings.filter")}
                    aria-label={t("settings.filter")}
                    className="w-full min-w-0 bg-transparent outline-none text-sm text-white/90 placeholder:text-white/35"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label={t("common.clearSearch")}
                      className="shrink-0 text-white/50 hover:text-white transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <nav aria-label={t("settings.navSections")} className="settings-nav">
                  {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        aria-pressed={isActive}
                        aria-controls={tab.id === "all" ? "settings-sections" : `section-${tab.id}`}
                        className={`settings-tab${isActive ? " is-active" : ""}`}
                        onClick={() => handleTabClick(tab.id)}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {t(`settings.tabs.${tab.id}`)}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>
          </div>
        </header>

          {/* Sections Stack — filtered by the active tab ("All" shows everything) */}
          <div className="mx-auto max-w-[1600px] px-4 md:px-10 lg:px-14 pb-20">
          <div id="settings-sections" className="space-y-6 settings-sections" ref={sectionsTopRef}>
            {nothingVisible && (
              <div className="glass-card text-center py-10 px-6" role="status">
                <p className="text-white/80 font-semibold">
                  {q && activeTab !== "all"
                    ? t("settings.emptyQuerySection", { q: query.trim() })
                    : q
                    ? t("settings.emptyQuery", { q: query.trim() })
                    : activeTab !== "all"
                    ? t("settings.emptySection")
                    : t("settings.emptyNoMatch")}
                </p>
                <p className="section-subtitle mt-1">{t("settings.emptyHint")}</p>
                <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                  {q && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="px-4 py-2 text-xs font-semibold rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors border-none"
                    >
                      {t("common.clearSearch")}
                    </button>
                  )}
                  {activeTab !== "all" && (
                    <button
                      type="button"
                      onClick={() => handleTabClick("all")}
                      className="px-4 py-2 text-xs font-semibold rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors border-none"
                    >
                      {t("common.showAll")}
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* ── 1. ACCOUNT SECTION ── */}
            {sectionVisible.account && (
              <section id="account" className="glass-card settings-section">
                <div className="section-header">
                  <h2 className="section-title">{t("settings.tabs.account")}</h2>
                  <p className="section-subtitle">
                    {t("settings.account.signInDesc")}
                  </p>
                </div>

                <div className="settings-list">
                  {/* Sign In / User Status */}
                  <div className="setting-row">
                    <div className="setting-meta flex items-center gap-3">
                      {user?.picture ? (
                        <img
                          src={user.picture}
                          alt={user.name || "User"}
                          className="w-10 h-10 rounded-full object-cover border border-white/20 shadow-md"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-sm">
                          {user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="setting-title">
                            {user ? user.name || user.email : t("settings.account.signedOut")}
                          </span>
                          {user?.provider === "google" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                              <GoogleLogoIcon size={11} /> Google
                            </span>
                          )}
                        </div>
                        <span className="setting-desc">
                          {user
                            ? user.email || t("settings.account.syncActive")
                            : t("settings.account.signInGoogleHint")}
                        </span>
                      </div>
                    </div>
                    <div className="setting-control flex items-center gap-2">
                      {user ? (
                        <button
                          onClick={handleSignOut}
                          className="glassy-button"
                        >
                          <LogOut className="w-4 h-4" />
                          {t("settings.account.signOut")}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowSignInModal(true)}
                            className="glassy-button glassy-button--primary px-5 py-2.5 text-[14px]"
                          >
                            <User className="w-4 h-4" />
                            {t("settings.account.signIn")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cloud Sync Status */}
                  <div className="setting-row mt-2 pt-2 border-t border-white/[0.06]">
                    <div className="setting-meta">
                      <div className="flex items-center gap-2">
                        <span className="setting-title">{t("settings.account.cloudSync")}</span>
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {t("settings.account.connected")}
                        </span>
                      </div>
                      <span className="setting-desc">
                        {user
                          ? syncStatus === "syncing"
                            ? t("settings.account.syncingMsg")
                            : lastSyncedAt
                            ? t("settings.account.lastSynced", {
                                time: new Date(lastSyncedAt).toLocaleTimeString(),
                              })
                            : t("settings.account.synced")
                          : t("settings.account.signInGoogleHint")}
                      </span>
                    </div>
                    {user && (
                      <div className="setting-control">
                        <button
                          onClick={async () => {
                            try {
                              await auth?.syncToCloud?.();
                              toast({
                                type: "success",
                                title: t("settings.account.cloudSync"),
                                message: t("settings.toasts.cloudSyncOk"),
                              });
                            } catch (error) {
                              logDebug("settings", "Cloud sync failed.", { message: error?.message });
                              toast({
                                type: "error",
                                title: t("settings.toasts.syncFailed"),
                                message: t("settings.toasts.syncFailedMsg"),
                              });
                            }
                          }}
                          disabled={syncStatus === "syncing"}
                          className="settings-hit px-3.5 py-1.5 text-xs font-semibold rounded-full bg-white/10 hover:bg-white/15 text-white transition-colors flex items-center gap-1.5 border border-white/10 cursor-pointer disabled:opacity-50"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${syncStatus === "syncing" ? "animate-spin" : ""}`} />
                          {t("settings.account.syncNow")}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Library & Shortcuts navigation */}
                  <div className="mt-2 pt-2 border-t border-white/[0.06] flex flex-col gap-1">
                    <SettingRow title={t("settings.account.myWatchlist")} description={t("settings.account.myWatchlistDesc")}>
                      <Link
                        to="/watchlist"
                        className="settings-hit px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        {t("settings.account.viewList")}
                        <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                      </Link>
                    </SettingRow>
                    <SettingRow title={t("settings.account.watchHistory")} description={t("settings.account.watchHistoryDesc")}>
                      <Link
                        to="/history"
                        className="settings-hit px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {t("settings.account.viewHistory")}
                        <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                      </Link>
                    </SettingRow>
                    <SettingRow title={t("settings.account.shortcuts")} description={t("settings.account.shortcutsDesc")}>
                      <button
                        type="button"
                        onClick={openShortcuts}
                        className="settings-hit px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white text-xs font-medium flex items-center gap-1 transition-colors border-none"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        {t("settings.account.openGuide")}
                        <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                      </button>
                    </SettingRow>
                  </div>
                </div>
              </section>
            )}

            {/* ── 2. APPEARANCE SECTION ── */}
            {sectionVisible.appearance && (
              <section id="appearance" className="glass-card settings-section">
                <div className="section-header">
                  <h2 className="section-title">{t("settings.tabs.appearance")}</h2>
                  <p className="section-subtitle">
                    {t("settings.appearance.appearanceDesc")}
                  </p>
                </div>

                <div className="settings-list">
                  {/* Theme */}
                  <div className="setting-row">
                    <div className="setting-meta">
                      <span className="setting-title">{t("settings.appearance.theme")}</span>
                      <span className="setting-desc">
                        {t("settings.appearance.themeDesc")}
                      </span>
                    </div>
                    <div className="setting-control">
                      <div className="relative theme-dropdown-wrap" ref={themeWrapRef}>
                        <button
                          type="button"
                          ref={themeTriggerRef}
                          aria-expanded={openDropdown === "theme"}
                          aria-haspopup="dialog"
                          aria-controls="theme-menu"
                          aria-label={t("settings.appearance.themeCurrent", { name: activeTheme.name })}
                          onClick={() => toggleDropdown("theme")}
                          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md group min-w-[150px] justify-between"
                        >
                          <span className="flex items-center gap-2 min-w-0 text-sm font-medium text-white/90">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: activeTheme.primary }}
                            />
                            <span className="theme-swatch-inline">
                              <span
                                className="theme-swatch-inline-left"
                                style={{ background: activeTheme.primary }}
                              />
                              <span
                                className="theme-swatch-inline-right"
                                style={{ background: activeTheme.secondary }}
                              />
                            </span>
                            <span className="truncate">{activeTheme.name.split(" ")[0]}</span>
                          </span>
                          <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${openDropdown === "theme" ? "rotate-180" : ""}`} />
                        </button>

                        <AnimatePresence>
                          {openDropdown === "theme" && (
                            <motion.div
                              id="theme-menu"
                              role="dialog"
                              aria-label={t("settings.appearance.chooseTheme")}
                              onKeyDown={handleMenuKeyDown}
                              initial={{ opacity: 0, y: 8, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 8, scale: 0.96 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 top-full mt-2 w-64 rounded-2xl p-2 shadow-2xl z-50 discovery-menu settings-dropdown"
                            >
                              <div role="listbox" aria-label={t("settings.appearance.themePresets")} className="flex flex-col gap-1">
                                {THEMES.map((t) => {
                                  const selected = theme === t.id;
                                  return (
                                    <button
                                      key={t.id}
                                      type="button"
                                      role="option"
                                      aria-selected={selected}
                                      tabIndex={selected ? 0 : -1}
                                      onClick={() => {
                                        setPreference("theme", t.id);
                                        selectFromDropdown("theme");
                                      }}
                                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                                        selected ? "settings-dropdown-item is-selected" : "settings-dropdown-item text-white/70 hover:text-white"
                                      }`}
                                    >
                                      <span className="flex items-center gap-2">
                                        <span className="theme-swatch-inline">
                                          <span
                                            className="theme-swatch-inline-left"
                                            style={{ background: t.primary }}
                                          />
                                          <span
                                            className="theme-swatch-inline-right"
                                            style={{ background: t.secondary }}
                                          />
                                        </span>
                                        <span>{t.name}</span>
                                      </span>
                                      {selected && <Check className="w-3.5 h-3.5 text-white" />}
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="theme-picker-divider" role="separator" />

                              {/* Custom accent seed — Cinejoy .seed-* recipe: a
                                  hidden color input tucked inside a pill. */}
                              <div className="seed-row px-1 py-1 w-full" role="group" aria-label="Custom accent">
                                <div className="setting-meta">
                                  <span className="setting-title">{t("settings.appearance.customAccent")}</span>
                                  <span className="setting-desc">{t("settings.appearance.customAccentDesc")}</span>
                                </div>
                                <div className="seed-row-pills">
                                  <label className="seed-pill" title={t("settings.appearance.pickAccent")}>
                                    <span
                                      className="seed-dot"
                                      style={{ background: accentSeed || "#ffffff" }}
                                    />
                                    <span className="seed-text">
                                      <span className="seed-label">
                                        {theme === "custom"
                                          ? t("settings.appearance.custom")
                                          : t("settings.appearance.customize")}
                                      </span>
                                      <span className="seed-hex">
                                        {(accentSeed || "#ffffff").toUpperCase()}
                                      </span>
                                    </span>
                                    <input
                                      type="color"
                                      value={accentSeed || "#95ff50"}
                                      aria-label={t("settings.appearance.pickAccent")}
                                      onChange={(e) => {
                                        setPreference("accentSeed", e.target.value);
                                        setPreference("theme", "custom");
                                      }}
                                    />
                                  </label>
                                  {(theme === "custom" || accentSeed) && (
                                    <button
                                      type="button"
                                      className="seed-reset"
                                      onClick={() => {
                                        setPreference("accentSeed", null);
                                        setPreference("theme", "default");
                                      }}
                                    >
                                      {t("common.reset")}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* Episode View Style */}
                  <SettingRow
                    title={t("settings.appearance.episodeViewStyle")}
                    description={t("settings.appearance.episodeViewDesc")}
                  >
                    <SegmentControl
                      label={t("settings.appearance.episodeViewStyle")}
                      options={[
                        { id: "carousel", name: t("settings.appearance.episodeCarousel") },
                        { id: "grid", name: t("settings.appearance.episodeGrid") },
                        { id: "list", name: t("settings.appearance.episodeList") },
                      ]}
                      value={["carousel", "grid", "list"].includes(episodeViewStyle) ? episodeViewStyle : "carousel"}
                      onChange={(val) => setPreference("episodeViewStyle", val)}
                    />
                  </SettingRow>

                  {/* Detail View Type */}
                  <SettingRow
                    title={t("settings.appearance.detailViewType")}
                    description={t("settings.appearance.detailViewDesc")}
                  >
                    <SegmentControl
                      label={t("settings.appearance.detailViewType")}
                      options={[
                        { id: "page", name: t("settings.appearance.detailPage") },
                        { id: "modal", name: t("settings.appearance.detailModal") },
                      ]}
                      value={detailViewType}
                      onChange={(val) => setPreference("detailViewType", val)}
                    />
                  </SettingRow>

                  {/* Use Image Logos */}
                  <SettingRow
                    title={t("settings.appearance.useImageLogos")}
                    description={t("settings.appearance.useImageLogosDesc")}
                  >
                    <Toggle
                      label={t("settings.appearance.useImageLogos")}
                      checked={useImageLogos}
                      onChange={(val) => setPreference("useImageLogos", val)}
                    />
                  </SettingRow>

                  {/* Trailers */}
                  <SettingRow
                    title={t("settings.appearance.trailers")}
                    description={t("settings.appearance.trailersDesc")}
                  >
                    <Toggle
                      label={t("settings.appearance.trailers")}
                      checked={trailers}
                      onChange={(val) => setPreference("trailers", val)}
                    />
                  </SettingRow>

                  {/* Spoiler-Free Mode */}
                  <SettingRow
                    title={t("settings.appearance.spoilerFreeMode")}
                    description={t("settings.appearance.spoilerFreeModeDesc")}
                  >
                    <Toggle
                      label={t("settings.appearance.spoilerFreeMode")}
                      checked={spoilerFreeMode}
                      onChange={(val) => setPreference("spoilerFreeMode", val)}
                    />
                  </SettingRow>

                  {/* Reduce Motion */}
                  <SettingRow
                    title={t("settings.appearance.reduceMotion")}
                    description={t("settings.appearance.reduceMotionDesc")}
                  >
                    <Toggle
                      label={t("settings.appearance.reduceMotion")}
                      checked={reduceMotion}
                      onChange={(val) => setPreference("reduceMotion", val)}
                    />
                  </SettingRow>

                  {/* High-Quality Thumbnails */}
                  <SettingRow
                    title={t("settings.appearance.hdThumbs")}
                    description={t("settings.appearance.hdThumbsDesc")}
                  >
                    <Toggle
                      label={t("settings.appearance.hdThumbs")}
                      checked={hdThumbs}
                      onChange={(val) => setPreference("hdThumbs", val)}
                    />
                  </SettingRow>
                </div>
              </section>
            )}

            {/* ── 3. PLAYBACK SECTION ── */}
            {sectionVisible.playback && (
              <section id="playback" className="glass-card settings-section">
                <div className="section-header">
                  <h2 className="section-title">{t("settings.tabs.playback")}</h2>
                  <p className="section-subtitle">
                    {t("settings.playback.playbackDesc")}
                  </p>
                </div>

                <div className="settings-list">
                  {/* Autoplay */}
                  <SettingRow
                    title={t("settings.playback.autoPlay")}
                    description={t("settings.playback.autoPlayDesc")}
                  >
                    <Toggle
                      label={t("settings.playback.autoPlay")}
                      checked={autoplay}
                      onChange={(val) => setPreference("autoplay", val)}
                    />
                  </SettingRow>

                  {/* Auto Skip Intro */}
                  <SettingRow
                    title={t("settings.playback.autoSkipIntro")}
                    description={t("settings.playback.autoSkipIntroDesc")}
                  >
                    <Toggle
                      label={t("settings.playback.autoSkipIntro")}
                      checked={autoSkipIntro}
                      onChange={(val) => setPreference("autoSkipIntro", val)}
                    />
                  </SettingRow>

                  {/* Seek Time */}
                  <div className="setting-row">
                    <div className="setting-meta">
                      <span className="setting-title">{t("settings.playback.seekTime")}</span>
                      <span className="setting-desc">
                        {t("settings.playback.seekTimeDesc")}
                      </span>
                    </div>
                    <div className="setting-control">
                      <div className="relative seek-dropdown-wrap" ref={seekWrapRef}>
                        <button
                          type="button"
                          ref={seekTriggerRef}
                          aria-expanded={openDropdown === "seek"}
                          aria-haspopup="listbox"
                          aria-controls="seek-menu"
                          aria-label={t("settings.playback.seekCurrent", { n: seekTime })}
                          onClick={() => toggleDropdown("seek")}
                          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md group min-w-[160px] justify-between"
                        >
                          <span className="min-w-0 text-sm font-medium text-white/90 truncate">
                            {t("settings.playback.seconds", { n: seekTime })}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${openDropdown === "seek" ? "rotate-180" : ""}`} />
                        </button>

                        <AnimatePresence>
                          {openDropdown === "seek" && (
                            <motion.div
                              id="seek-menu"
                              role="listbox"
                              aria-label={t("settings.playback.seekAria")}
                              onKeyDown={handleMenuKeyDown}
                              initial={{ opacity: 0, y: 8, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 8, scale: 0.96 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 top-full mt-2 w-44 rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1 discovery-menu settings-dropdown"
                            >
                              {SEEK_TIMES.map((st) => {
                                const selected = Number(seekTime) === st.value;
                                return (
                                  <button
                                    key={st.value}
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    tabIndex={selected ? 0 : -1}
                                    onClick={() => {
                                      setPreference("seekTime", st.value);
                                      selectFromDropdown("seek");
                                    }}
                                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                                      selected ? "settings-dropdown-item is-selected" : "settings-dropdown-item text-white/70 hover:text-white"
                                    }`}
                                  >
                                    <span>{t("settings.playback.seconds", { n: st.value })}</span>
                                    {selected && <Check className="w-3.5 h-3.5 text-white" />}
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* Auto Subtitles */}
                  <SettingRow
                    title={t("settings.playback.autoSubtitles")}
                    description={t("settings.playback.autoSubtitlesDesc")}
                  >
                    <Toggle
                      label={t("settings.playback.autoSubtitles")}
                      checked={autoSubtitles}
                      onChange={(val) => setPreference("autoSubtitles", val)}
                    />
                  </SettingRow>

                  {/* Default Language */}
                  <div className="setting-row">
                    <div className="setting-meta">
                      <span className="setting-title">{t("settings.playback.defaultLanguage")}</span>
                      <span className="setting-desc">
                        {t("settings.playback.defaultLanguageDesc")}
                      </span>
                    </div>
                    <div className="setting-control">
                      <div className="relative lang-dropdown-wrap" ref={langWrapRef}>
                        <button
                          type="button"
                          ref={langTriggerRef}
                          aria-expanded={openDropdown === "lang"}
                          aria-haspopup="listbox"
                          aria-controls="lang-menu"
                          aria-label={t("settings.playback.defaultLangCurrent", { name: activeLang.name })}
                          onClick={() => toggleDropdown("lang")}
                          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md group min-w-[160px] justify-between"
                        >
                          <span className="flex items-center gap-2.5 min-w-0 text-sm font-medium text-white/90">
                            <LanguageFlag
                              code={activeLang.code}
                              className="w-5 h-3.5 rounded-[3px] object-cover shrink-0"
                              src={activeLang.flag}
                            />
                            <span className="truncate">{activeLang.name}</span>
                          </span>
                          <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${openDropdown === "lang" ? "rotate-180" : ""}`} />
                        </button>

                        <AnimatePresence>
                          {openDropdown === "lang" && (
                            <motion.div
                              id="lang-menu"
                              role="listbox"
                              aria-label={t("settings.playback.defaultLangAria")}
                              onKeyDown={handleMenuKeyDown}
                              initial={{ opacity: 0, y: 8, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 8, scale: 0.96 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 top-full mt-2 w-52 max-h-60 overflow-y-auto rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1 discovery-menu settings-dropdown"
                            >
                              {LANGUAGES.map((l) => {
                                const selected = defaultLanguage === l.code;
                                return (
                                  <button
                                    key={l.code}
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    tabIndex={selected ? 0 : -1}
                                    onClick={() => {
                                      setPreference("defaultLanguage", l.code);
                                      selectFromDropdown("lang");
                                      toast({
                                        type: "success",
                                        title: t("settings.toasts.defaultLanguage"),
                                        message: t("settings.toasts.defaultLanguageSet", { lang: l.name }),
                                      });
                                    }}
                                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                                      selected ? "settings-dropdown-item is-selected" : "settings-dropdown-item text-white/70 hover:text-white"
                                    }`}
                                  >
                                    <span className="flex items-center gap-2.5">
                                      <LanguageFlag
                                        code={l.code}
                                        className="w-4 h-3 rounded-[2px] object-cover shrink-0"
                                        src={l.flag}
                                      />
                                      <span>{l.name}</span>
                                    </span>
                                    {selected && <Check className="w-3.5 h-3.5 text-white" />}
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* Mute Trailer Audio */}
                  <SettingRow
                    title={t("settings.playback.muteTrailerAudio")}
                    description={t("settings.playback.muteTrailerAudioDesc")}
                  >
                    <Toggle
                      label={t("settings.playback.muteTrailerAudio")}
                      checked={muteTrailers}
                      onChange={(val) => setPreference("muteTrailers", val)}
                    />
                  </SettingRow>
                </div>
              </section>
            )}

            {/* ── 4. SERVER ORDER SECTION ── */}
            {sectionVisible.servers && (
              <section id="servers" className="glass-card settings-section">
                <div className="section-header flex items-center justify-between">
                  <div>
                    <h2 className="section-title">{t("settings.servers.serverOrder")}</h2>
                    <p className="section-subtitle">
                      {t("settings.servers.serverOrderDesc")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetServerOrder}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white/70 hover:text-white transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t("common.reset")}
                  </button>
                </div>

                <ServerOrderList list={serverList} onReorder={reorderServers} onMoveKeyboard={moveServerKeyboard} />
              </section>
            )}

            {/* ── 5. SUBTITLES SECTION ── */}
            {sectionVisible.subtitles && (
              <section id="subtitles" className="glass-card settings-section">
                <div className="section-header">
                  <h2 className="section-title">{t("settings.tabs.subtitles")}</h2>
                  <p className="section-subtitle">
                    {t("settings.subtitles.subtitlesDesc")}
                  </p>
                </div>

                <div className="settings-list">
                  {/* Font */}
                  <SettingRow
                    title={t("settings.playback.subtitleFont")}
                    description={t("settings.playback.subtitleFontDesc")}
                  >
                    <SegmentControl
                      label={t("settings.playback.subtitleFont")}
                      options={SUBTITLE_FONTS}
                      value={subtitleFont}
                      onChange={(val) => setPreference("subtitleFont", val)}
                    />
                  </SettingRow>

                  {/* Text Size */}
                  <SettingRow
                    title={t("settings.playback.subtitleSize")}
                    description={t("settings.playback.subtitleSizeDesc")}
                  >
                    <div className="range-wrap">
                      <span className="range-value">{t("settings.playback.sizePct", { n: subtitleSize })}</span>
                      <input
                        type="range"
                        min="50"
                        max="150"
                        step="10"
                        value={subtitleSize}
                        aria-label={t("settings.playback.subtitleSizeAria", { n: subtitleSize })}
                        onChange={(e) => setPreference("subtitleSize", Number(e.target.value))}
                        className="range-slider"
                      />
                    </div>
                  </SettingRow>

                  {/* Text Color */}
                  <SettingRow
                    title={t("settings.playback.subtitleColor")}
                    description={t("settings.playback.subtitleColorDesc")}
                  >
                    <div className="color-picker">
                      {SUBTITLE_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          title={c.name}
                          aria-label={`Subtitle color ${c.name}`}
                          aria-pressed={subtitleColor === c.value}
                          onClick={() => setPreference("subtitleColor", c.value)}
                          className={`color-dot${subtitleColor === c.value ? " active" : ""}`}
                          style={{ backgroundColor: c.value }}
                        />
                      ))}
                    </div>
                  </SettingRow>

                  {/* Real-time Subtitle Live Preview Box — the full demo mini-player
                      (Big Buck Bunny poster/video + the real player chrome + the
                      live subtitle line driven by the preferences above). */}
                  {/* Real-time Subtitle Live Preview Box — the full demo-mini
                      (Big Buck Bunny poster + real player chrome + live subtitle
                      line driven by the preferences above). */}
                <div className="mt-4">
                  <PlayerPreview label={t("settings.tabs.subtitles")} />
                </div>
                </div>
              </section>
            )}

            {/* ── 6. IN-APP NOTIFICATIONS ── */}
            {sectionVisible.notifications && (
              <section id="notifications" className="glass-card settings-section">
                <div className="section-header">
                  <h2 className="section-title">{t("settings.tabs.notifications")}</h2>
                  <p className="section-subtitle">
                    {t("settings.notifications.notificationsDesc")}
                  </p>
                </div>

                <div className="settings-list">
                  <SettingRow
                    title={t("settings.notifications.show")}
                    description={t("settings.notifications.showDesc")}
                  >
                    <Toggle
                      label={t("settings.notifications.show")}
                      checked={notifications}
                      onChange={(val) => setPreference("notifications", val)}
                    />
                  </SettingRow>
                </div>
              </section>
            )}

            {/* ── 7. FACTORY RESET PREFERENCES ── */}
            {sectionVisible.reset && (
              <section id="reset-preferences" className="glass-card settings-section">
                <div className="section-header">
                  <h2 className="section-title">{t("settings.reset.title")}</h2>
                  <p className="section-subtitle">
                    {t("settings.reset.desc")}
                  </p>
                </div>

                <div className="settings-list">
                  <SettingRow
                    title={t("settings.reset.rowTitle")}
                    description={t("settings.reset.rowDesc")}
                  >
                    <button
                      type="button"
                      onClick={handleResetAllPreferences}
                      className="reset-preferences-button"
                    >
                      <RotateCcw size={14} /> {t("settings.reset.resetBtn")}
                    </button>
                  </SettingRow>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialogRenderer />

      {/* ── MODALS ── */}

      {/* Sign-In Modal — Cinejoy glass login panel. AnimatePresence lives
              inside the portal so the exit animation actually plays (the old
              conditional form unmounted immediately). */}
      {createPortal(
        <AnimatePresence>
          {showSignInModal && (
            <motion.div
              key="login-backdrop"
              className="login-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setShowSignInModal(false);
              }}
            >
            <motion.div
              ref={loginPanelRef}
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="login-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="login-panel-title"
              tabIndex={-1}
            >
              <button
                onClick={() => setShowSignInModal(false)}
                aria-label={t("settings.account.closeSignIn")}
                className="absolute right-5 top-5 p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="login-panel-title" className="text-lg font-bold text-white">
                    {t("settings.account.welcome")}
                  </h3>
                  <p className="text-xs text-white/50">{t("settings.account.welcomeDesc")}</p>
                </div>
              </div>

              {/* Sign In / Guest tabs with a sliding white pill */}
              <div className="login-tabs mb-4" role="tablist" aria-label={t("settings.account.signInMethod")}>
                <span
                  className={`login-tab-pill${signInTab === "guest" ? " is-right" : ""}`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  role="tab"
                  aria-selected={signInTab === "signin"}
                  className={`login-tab${signInTab === "signin" ? " is-active" : ""}`}
                  onClick={() => setSignInTab("signin")}
                >
                  {t("settings.account.signIn")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={signInTab === "guest"}
                  className={`login-tab${signInTab === "guest" ? " is-active" : ""}`}
                  onClick={() => setSignInTab("guest")}
                >
                  {t("settings.account.guest")}
                </button>
              </div>

              {signInTab === "signin" ? (
                <div className="space-y-3">
                  <GoogleSignInButton
                    onSuccess={() => setShowSignInModal(false)}
                    shape="pill"
                    text={t("settings.account.continueGoogle")}
                  />
                  <p className="text-center text-xs text-white/40 leading-relaxed">
                    {t("settings.account.googleHint")}
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    // NOTE: form.name would resolve to the form's own `name`
                    // attribute (a string), never the input — read via FormData.
                    const data = new FormData(e.target);
                    handleSignIn(data.get("name"), data.get("email"));
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label htmlFor="login-name" className="block text-xs font-semibold text-white/70 mb-1.5">
                      {t("settings.account.name")}
                    </label>
                    <input
                      id="login-name"
                      name="name"
                      type="text"
                      required
                      defaultValue={t("settings.account.defaultName")}
                      className="login-field"
                    />
                  </div>
                  <div>
                    <label htmlFor="login-email" className="block text-xs font-semibold text-white/70 mb-1.5">
                      {t("settings.account.email")}
                    </label>
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      required
                      defaultValue="viewer@streamly.io"
                      className="login-field"
                    />
                  </div>

                  <button type="submit" className="login-cta mt-1">
                    {t("settings.account.continueAsGuest")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSignInModal(false)}
                    className="w-full py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 text-sm font-semibold transition-colors border-none"
                  >
                    {t("common.cancel")}
                  </button>
                </form>
              )}
            </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      </div>
  );
}
