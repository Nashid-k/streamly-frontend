import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Settings,
  User,
  Palette,
  Play,
  Server,
  Captions,
  Megaphone,
  KeyRound,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Check,
  X,
  Search,
  GripVertical,
  RotateCcw,
  CircleHelp,
  Eye,
  EyeOff,
  LogOut,
  Bookmark,
  Clock,
  Sparkles,
} from "lucide-react";
import SEO from "../components/SEO";
import { usePreferences } from "../context/preferences";
import { useToast } from "../components/Toast.jsx";

const THEMES = [
  {
    id: "default",
    name: "Default (Streamly)",
    primary: "#f43f5e",
    secondary: "#fb923c",
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
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "pt", name: "Portuguese", flag: "🇧🇷" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
];

const SEEK_TIMES = [5, 10, 15, 30];

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

const DEFAULT_SERVER_ORDER = [
  "Lisbon",
  "Nebula",
  "Solara",
  "Athens",
  "Joy",
  "Castle",
  "Sakura",
  "Canaias",
];

const TABS = [
  { id: "account", label: "Account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "playback", label: "Playback", icon: Play },
  { id: "servers", label: "Servers", icon: Server },
  { id: "subtitles", label: "Subtitles", icon: Captions },
  { id: "ads", label: "Ads", icon: Megaphone },
  { id: "febbox", label: "Febbox", icon: KeyRound },
];

function TraktLogo({ className = "w-4 h-4" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" className={className} aria-hidden="true">
      <path fill="currentColor" d="m15.082 15.107l-.73-.73l9.578-9.583a5 5 0 0 0-.115-.575L13.662 14.382l1.08 1.08l-.73.73l-1.81-1.81l11.22-11.238c-.075-.15-.155-.3-.25-.44L11.508 14.377l2.154 2.155l-.73.73l-7.193-7.199l.73-.73l4.309 4.31L22.546 1.86A5.62 5.62 0 0 0 18.362 0H5.635A5.637 5.637 0 0 0 0 5.634V18.37A5.63 5.63 0 0 0 5.635 24h12.732C21.477 24 24 21.48 24 18.37V6.19l-8.913 8.918zm-4.314-2.155L6.814 8.988l.73-.73l3.954 3.96zm1.075-1.084l-3.954-3.96l.73-.73l3.959 3.96zm9.853 5.688a4.14 4.14 0 0 1-4.14 4.14H6.438a4.144 4.144 0 0 1-4.139-4.14V6.438A4.14 4.14 0 0 1 6.44 2.3h10.387v1.04H6.438a3.1 3.1 0 0 0-3.099 3.1v11.11c0 1.71 1.39 3.105 3.1 3.105h11.117c1.71 0 3.1-1.395 3.1-3.105v-1.754h1.04v1.754z"></path>
    </svg>
  );
}

function SimklLogo({ className = "w-4 h-4" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" className={className} aria-hidden="true">
      <path fill="currentColor" d="M3.84 0A3.83 3.83 0 0 0 0 3.84v16.32A3.83 3.83 0 0 0 3.84 24h16.32A3.83 3.83 0 0 0 24 20.16V3.84A3.83 3.83 0 0 0 20.16 0zm8.567 4.11q3.11 0 4.393.186q1.69.252 2.438.877q1.009.867 1.009 3.104q0 .241-.01.768h-4.234q-.021-.537-.074-.746q-.147-.615-.966-.692q-.725-.065-3.53-.066q-2.775 0-3.289.165q-.578.2-.578 1.024q0 .792.61.969q.514.143 4.633.275q3.73.11 4.76.275q1.04.165 1.654.495t.983.936q.556.892.557 2.873q0 2.212-.546 3.247q-.547 1.024-1.785 1.398q-1.219.374-6.71.374q-3.338 0-4.82-.187q-1.806-.22-2.593-.86q-.85-.684-1.008-1.93a10.5 10.5 0 0 1-.085-1.434v-.789H7.44q-.01 1.11.43 1.428q.232.151.525.203q.294.056 1.03.077a166 166 0 0 0 2.405.022q2.793-.01 3.234-.033q.83-.065 1.092-.23q.368-.242.368-1.077q0-.57-.231-.802q-.316-.318-1.503-.34q-.82 0-3.425-.132q-2.69-.133-3.488-.154q-2.08-.066-2.932-.505q-1.092-.56-1.429-1.91q-.189-.747-.189-1.956q0-2.547.925-3.59q.693-.79 2.102-1.044q1.271-.22 6.053-.22z"></path>
    </svg>
  );
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
  return (
    <div className="segment" role="radiogroup" aria-label={label}>
      {options.map((opt) => {
        const id = typeof opt === "string" ? opt : opt.id;
        const name = typeof opt === "string" ? opt : opt.name;
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
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

function SettingRow({ title, description, children }) {
  return (
    <div className="setting-row">
      <div className="setting-meta">
        <span className="setting-title">{title}</span>
        {description && <span className="setting-desc">{description}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("all");
  const [query, setQuery] = useState("");
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [seekDropdownOpen, setSeekDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [showFebboxGuide, setShowFebboxGuide] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showTraktModal, setShowTraktModal] = useState(false);
  const [showSimklModal, setShowSimklModal] = useState(false);

  // Auth / Accounts state (persisted locally)
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("streamly_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [traktUsername, setTraktUsername] = useState(() => {
    try {
      return localStorage.getItem("streamly_trakt") || "";
    } catch {
      return "";
    }
  });
  const [simklUsername, setSimklUsername] = useState(() => {
    try {
      return localStorage.getItem("streamly_simkl") || "";
    } catch {
      return "";
    }
  });

  const {
    // Existing
    autoplay,
    hdThumbs,
    reduceMotion,
    notifications,
    // Appearance
    theme = "default",
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
    // Subtitles
    subtitleFont = "cinejoy",
    subtitleSize = 100,
    subtitleColor = "#ffffff",
    subtitleBgBlur = true,
    // Ads
    enableAds = true,
    // Febbox
    febboxCookie = "",
    // Setter
    setPreference,
  } = usePreferences();

  // Febbox local input
  const [cookieInput, setCookieInput] = useState(febboxCookie);
  const [showCookie, setShowCookie] = useState(false);

  useEffect(() => {
    setCookieInput(febboxCookie || "");
  }, [febboxCookie]);

  const q = useMemo(() => query.trim().toLowerCase(), [query]);

  const activeTheme = useMemo(
    () => THEMES.find((t) => t.id === theme) || THEMES[0],
    [theme],
  );

  const activeLang = useMemo(
    () => LANGUAGES.find((l) => l.code === defaultLanguage) || LANGUAGES[0],
    [defaultLanguage],
  );

  const activeFont = useMemo(
    () => SUBTITLE_FONTS.find((f) => f.id === subtitleFont) || SUBTITLE_FONTS[0],
    [subtitleFont],
  );

  // Close dropdowns on outside click
  const dropdownRef = useRef(null);
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setThemeDropdownOpen(false);
        setSeekDropdownOpen(false);
        setLangDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const openShortcuts = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true }));
  };

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    if (tabId === "all") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const el = document.getElementById(tabId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  const handleSaveCookie = () => {
    setPreference("febboxCookie", cookieInput.trim());
    toast({
      type: "success",
      title: "Febbox Cookie Saved",
      message: "Your 4K streaming cookie has been updated.",
      duration: 3000,
    });
  };

  // Server reordering
  const moveServer = (index, dir) => {
    const current = Array.isArray(serverOrder) ? [...serverOrder] : [...DEFAULT_SERVER_ORDER];
    const target = index + dir;
    if (target < 0 || target >= current.length) return;
    const item = current.splice(index, 1)[0];
    current.splice(target, 0, item);
    setPreference("serverOrder", current);
  };

  const resetServerOrder = () => {
    setPreference("serverOrder", [...DEFAULT_SERVER_ORDER]);
    toast({
      type: "info",
      title: "Servers Reset",
      message: "Server priority reset to factory default.",
    });
  };

  // Modal Sign-in actions
  const handleSignIn = (name, email) => {
    const u = { name: name || "Streamly User", email: email || "user@streamly.io" };
    setUser(u);
    try {
      localStorage.setItem("streamly_user", JSON.stringify(u));
    } catch {
      // Storage fallback
    }
    setShowSignInModal(false);
    toast({
      type: "success",
      title: "Signed In",
      message: `Welcome back, ${u.name}!`,
    });
  };

  const handleSignOut = () => {
    setUser(null);
    try {
      localStorage.removeItem("streamly_user");
    } catch {
      // Storage fallback
    }
    toast({
      type: "info",
      title: "Signed Out",
      message: "You have signed out of your account.",
    });
  };

  const handleConnectTrakt = (username) => {
    setTraktUsername(username);
    try {
      localStorage.setItem("streamly_trakt", username);
    } catch {
      // Storage fallback
    }
    setShowTraktModal(false);
    toast({
      type: "success",
      title: "Trakt Connected",
      message: `Connected to Trakt account @${username}.`,
    });
  };

  const handleConnectSimkl = (username) => {
    setSimklUsername(username);
    try {
      localStorage.setItem("streamly_simkl", username);
    } catch {
      // Storage fallback
    }
    setShowSimklModal(false);
    toast({
      type: "success",
      title: "Simkl Connected",
      message: `Connected to Simkl account @${username}.`,
    });
  };

  // Search filter helper
  const matchesSearch = (text) => !q || text.toLowerCase().includes(q);

  return (
    <div className="main-content content-page settings-page min-h-screen" ref={dropdownRef}>
      <SEO title="Settings - Streamly" description="Configure player, servers, appearance, subtitles and accounts." />
      <div className="settings-page__glow" aria-hidden="true" />

      <div className="relative z-10 pt-4 md:pt-14 pb-28 px-4 sm:px-6 md:px-10 lg:px-14">
        <div className="mx-auto max-w-[780px]">
          {/* Header Row */}
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center justify-center text-white drop-shadow-lg transition-transform duration-200 hover:scale-110 active:scale-90 p-1.5 rounded-full hover:bg-white/10"
                aria-label="Go back"
              >
                <ArrowLeft className="w-7 h-7 text-white" />
              </button>
              <div className="flex items-center gap-3">
                <Settings className="h-8 w-8 shrink-0 text-white" />
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-none text-white">
                  Settings
                </h1>
              </div>
            </div>
          </div>

          {/* Quick Search Bar */}
          <div className="mb-6 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all settings..."
              className="w-full bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.16] focus:border-white/[0.28] rounded-2xl py-3 pl-11 pr-10 text-sm text-white placeholder-white/40 backdrop-blur-md outline-none transition-all"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Top Tabs Navigation Bar */}
          <nav aria-label="Settings sections" className="settings-nav mb-6">
            <button
              className={`settings-tab${activeTab === "all" ? " is-active" : ""}`}
              onClick={() => handleTabClick("all")}
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              All
            </button>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={`settings-tab${isActive ? " is-active" : ""}`}
                  onClick={() => handleTabClick(tab.id)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Sections Stack */}
          <div className="space-y-6">
            {/* ── 1. ACCOUNT SECTION ── */}
            {(activeTab === "all" || activeTab === "account") && (matchesSearch("account sign in trakt simkl list history") || !q) && (
              <section id="account" className="glass-card">
                <div className="section-header">
                  <h2 className="section-title">Account</h2>
                  <p className="section-subtitle">
                    Sign in to sync your settings and watch progress across devices.
                  </p>
                </div>

                <div className="settings-list">
                  {/* Sign In / User Status */}
                  <div className="setting-row">
                    <div className="setting-meta">
                      <span className="setting-title">
                        {user ? `Signed in as ${user.name || user.email}` : "Not signed in"}
                      </span>
                      <span className="setting-desc">
                        {user
                          ? user.email || "Your profile and library are actively synchronized."
                          : "Create an account or sign in to sync your data across all your screens."}
                      </span>
                    </div>
                    <div className="setting-control">
                      {user ? (
                        <button
                          onClick={handleSignOut}
                          className="px-4 py-2 text-[13.5px] font-semibold rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowSignInModal(true)}
                          className="px-5 py-2.5 text-[14px] font-semibold rounded-full bg-white text-black hover:bg-gray-100 transition-colors shadow-[0_2px_10px_rgba(255,255,255,0.1)] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
                        >
                          Sign In
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Connect Trakt & Simkl */}
                  <div className="mt-2 pt-2 border-t border-white/[0.06] flex flex-col gap-1.5">
                    {/* Trakt */}
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-white/[0.03] transition-all">
                      <button
                        onClick={() => setShowTraktModal(true)}
                        className="flex-1 min-w-0 flex items-center gap-4 text-left border-none bg-transparent cursor-pointer p-1"
                      >
                        <div className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-red-500/10 text-red-400 border border-red-500/20">
                          <TraktLogo className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col items-start gap-0.5 text-left min-w-0">
                          <span className="text-[14.5px] font-medium text-white/90">
                            {traktUsername ? `Trakt (@${traktUsername})` : "Connect Trakt"}
                          </span>
                          <span className="text-[13px] text-white/50">
                            Sync your watchlist, history and progress from Trakt
                          </span>
                        </div>
                      </button>
                      {traktUsername ? (
                        <button
                          onClick={() => handleConnectTrakt("")}
                          className="px-3 py-1.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                        >
                          Connected
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowTraktModal(true)}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
                        >
                          Connect
                        </button>
                      )}
                    </div>

                    {/* Simkl */}
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-white/[0.03] transition-all">
                      <button
                        onClick={() => setShowSimklModal(true)}
                        className="flex-1 min-w-0 flex items-center gap-4 text-left border-none bg-transparent cursor-pointer p-1"
                      >
                        <div className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <SimklLogo className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col items-start gap-0.5 text-left min-w-0">
                          <span className="text-[14.5px] font-medium text-white/90">
                            {simklUsername ? `Simkl (@${simklUsername})` : "Connect Simkl"}
                          </span>
                          <span className="text-[13px] text-white/50">
                            Sync your watchlist, history and progress from Simkl
                          </span>
                        </div>
                      </button>
                      {simklUsername ? (
                        <button
                          onClick={() => handleConnectSimkl("")}
                          className="px-3 py-1.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                        >
                          Connected
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowSimklModal(true)}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick library links */}
                  <div className="mt-2 pt-2 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Link
                      to="/watchlist"
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] text-white/80 transition-all text-sm font-medium"
                    >
                      <span className="flex items-center gap-2.5">
                        <Bookmark className="w-4 h-4 text-rose-400" />
                        My Watchlist
                      </span>
                      <ChevronRight className="w-4 h-4 text-white/40" />
                    </Link>
                    <Link
                      to="/history"
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] text-white/80 transition-all text-sm font-medium"
                    >
                      <span className="flex items-center gap-2.5">
                        <Clock className="w-4 h-4 text-amber-400" />
                        Watch History
                      </span>
                      <ChevronRight className="w-4 h-4 text-white/40" />
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* ── 2. APPEARANCE SECTION ── */}
            {(activeTab === "all" || activeTab === "appearance") && (matchesSearch("appearance theme episode style view logo trailer spoiler motion") || !q) && (
              <section id="appearance" className="glass-card">
                <div className="section-header">
                  <h2 className="section-title">Appearance</h2>
                  <p className="section-subtitle">
                    Change the look of the site to suit your needs.
                  </p>
                </div>

                <div className="settings-list">
                  {/* Theme Selector */}
                  <SettingRow
                    title="Theme"
                    description="Pick a color palette for the entire interface."
                  >
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md group min-w-[150px] justify-between text-left"
                      >
                        <span className="flex items-center gap-2 min-w-0 text-sm font-medium text-white/90">
                          <span className="theme-swatch-inline">
                            <span className="theme-swatch-inline-left" style={{ background: activeTheme.primary }} />
                            <span className="theme-swatch-inline-right" style={{ background: activeTheme.secondary }} />
                          </span>
                          <span className="truncate">{activeTheme.name.split(" ")[0]}</span>
                        </span>
                        <ChevronDown className={`w-4 h-4 text-white/50 shrink-0 group-hover:text-white transition-transform duration-300 ${themeDropdownOpen ? "rotate-180" : ""}`} />
                      </button>

                      {themeDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-52 py-1.5 rounded-2xl bg-[#121216] border border-white/12 shadow-2xl backdrop-blur-2xl z-50 overflow-hidden">
                          {THEMES.map((t) => {
                            const isCurrent = t.id === theme;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  setPreference("theme", t.id);
                                  setThemeDropdownOpen(false);
                                  toast({
                                    type: "settings",
                                    title: "Theme Changed",
                                    message: `Applied ${t.name} color palette.`,
                                  });
                                }}
                                className={`w-full flex items-center justify-between px-3.5 py-2 text-sm text-left transition-colors ${isCurrent ? "bg-white/10 text-white font-semibold" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="theme-swatch-inline">
                                    <span className="theme-swatch-inline-left" style={{ background: t.primary }} />
                                    <span className="theme-swatch-inline-right" style={{ background: t.secondary }} />
                                  </span>
                                  <span className="truncate">{t.name}</span>
                                </div>
                                {isCurrent && <Check className="w-4 h-4 text-white shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </SettingRow>

                  {/* Episode View Style */}
                  <SettingRow
                    title="Episode View Style"
                    description="Choose how episodes appear on series pages."
                  >
                    <SegmentControl
                      label="Episode View Style"
                      options={[
                        { id: "carousel", name: "Carousel" },
                        { id: "grid", name: "Grid" },
                      ]}
                      value={episodeViewStyle}
                      onChange={(v) => setPreference("episodeViewStyle", v)}
                    />
                  </SettingRow>

                  {/* Detail View Type */}
                  <SettingRow
                    title="Detail View Type"
                    description="Pick between a full page or a compact modal."
                  >
                    <SegmentControl
                      label="Detail View Type"
                      options={[
                        { id: "page", name: "Page" },
                        { id: "modal", name: "Modal" },
                      ]}
                      value={detailViewType}
                      onChange={(v) => setPreference("detailViewType", v)}
                    />
                  </SettingRow>

                  {/* Use Image Logos */}
                  <SettingRow
                    title="Use Image Logos"
                    description="Display movie and series titles as image logos."
                  >
                    <Toggle
                      checked={useImageLogos}
                      onChange={(v) => setPreference("useImageLogos", v)}
                      label="Use Image Logos"
                    />
                  </SettingRow>

                  {/* Trailers */}
                  <SettingRow
                    title="Trailers"
                    description="Play trailers automatically on detail pages and hover previews."
                  >
                    <Toggle
                      checked={trailers}
                      onChange={(v) => setPreference("trailers", v)}
                      label="Trailers"
                    />
                  </SettingRow>

                  {/* Spoiler-Free Mode */}
                  <SettingRow
                    title="Spoiler-Free Mode"
                    description="Hide information about upcoming episodes."
                  >
                    <Toggle
                      checked={spoilerFreeMode}
                      onChange={(v) => setPreference("spoilerFreeMode", v)}
                      label="Spoiler-Free Mode"
                    />
                  </SettingRow>

                  {/* High Quality Thumbnails */}
                  <SettingRow
                    title="High-Quality Thumbnails"
                    description="Stream higher resolution artwork and posters."
                  >
                    <Toggle
                      checked={hdThumbs}
                      onChange={(v) => setPreference("hdThumbs", v)}
                      label="High-Quality Thumbnails"
                    />
                  </SettingRow>

                  {/* Reduce Motion */}
                  <SettingRow
                    title="Reduce Motion"
                    description="Minimize animations, transitions, and particle effects."
                  >
                    <Toggle
                      checked={reduceMotion}
                      onChange={(v) => setPreference("reduceMotion", v)}
                      label="Reduce Motion"
                    />
                  </SettingRow>
                </div>
              </section>
            )}

            {/* ── 3. PLAYBACK SECTION ── */}
            {(activeTab === "all" || activeTab === "playback") && (matchesSearch("playback autoplay skip intro controls seek time subtitle language") || !q) && (
              <section id="playback" className="glass-card">
                <div className="section-header">
                  <h2 className="section-title">Playback</h2>
                  <p className="section-subtitle">
                    Configure how your video player behaves.
                  </p>
                </div>

                <div className="settings-list">
                  {/* Autoplay */}
                  <SettingRow
                    title="Autoplay"
                    description="Automatically play the next episode when one ends. Videos still start on their own when this is off."
                  >
                    <Toggle
                      checked={autoplay}
                      onChange={(v) => setPreference("autoplay", v)}
                      label="Autoplay"
                    />
                  </SettingRow>

                  {/* Auto Skip Intro */}
                  <SettingRow
                    title="Auto Skip Intro"
                    description="Jump past the intro on its own, instead of showing the Skip Intro button."
                  >
                    <Toggle
                      checked={autoSkipIntro}
                      onChange={(v) => setPreference("autoSkipIntro", v)}
                      label="Auto Skip Intro"
                    />
                  </SettingRow>

                  {/* Player Controls */}
                  <SettingRow
                    title="Player Controls"
                    description="Rearrange player shortcuts, buttons, and gesture preferences."
                  >
                    <button
                      type="button"
                      onClick={openShortcuts}
                      className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md text-sm font-medium text-white/90 whitespace-nowrap"
                    >
                      Customize
                      <ChevronRight className="w-4 h-4 text-white/50" />
                    </button>
                  </SettingRow>

                  {/* Seek Time */}
                  <SettingRow
                    title="Seek Time"
                    description="Change how far you skip forwards or backwards on touch or arrow keys."
                  >
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setSeekDropdownOpen(!seekDropdownOpen)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md group min-w-[140px] justify-between"
                      >
                        <span className="text-sm font-medium text-white/90">{seekTime} seconds</span>
                        <ChevronDown className={`w-4 h-4 text-white/50 shrink-0 group-hover:text-white transition-transform duration-300 ${seekDropdownOpen ? "rotate-180" : ""}`} />
                      </button>

                      {seekDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-44 py-1.5 rounded-2xl bg-[#121216] border border-white/12 shadow-2xl backdrop-blur-2xl z-50 overflow-hidden">
                          {SEEK_TIMES.map((sec) => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => {
                                setPreference("seekTime", sec);
                                setSeekDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3.5 py-2 text-sm text-left transition-colors ${seekTime === sec ? "bg-white/10 text-white font-semibold" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
                            >
                              <span>{sec} seconds</span>
                              {seekTime === sec && <Check className="w-4 h-4 text-white shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </SettingRow>

                  {/* Auto Subtitles */}
                  <SettingRow
                    title="Auto Subtitles"
                    description="Automatically select subtitles in your preferred language when available."
                  >
                    <Toggle
                      checked={autoSubtitles}
                      onChange={(v) => setPreference("autoSubtitles", v)}
                      label="Auto Subtitles"
                    />
                  </SettingRow>

                  {/* Default Language */}
                  <SettingRow
                    title="Default Language"
                    description="Choose the subtitle and audio language to auto-select."
                  >
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                        className="flex items-center gap-2.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md group min-w-[160px] justify-between"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-white/90">
                          <span className="text-base">{activeLang.flag}</span>
                          <span className="truncate">{activeLang.name}</span>
                        </span>
                        <ChevronDown className={`w-4 h-4 text-white/50 shrink-0 group-hover:text-white transition-transform duration-300 ${langDropdownOpen ? "rotate-180" : ""}`} />
                      </button>

                      {langDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-48 max-h-60 overflow-y-auto py-1.5 rounded-2xl bg-[#121216] border border-white/12 shadow-2xl backdrop-blur-2xl z-50">
                          {LANGUAGES.map((l) => (
                            <button
                              key={l.code}
                              type="button"
                              onClick={() => {
                                setPreference("defaultLanguage", l.code);
                                setLangDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3.5 py-2 text-sm text-left transition-colors ${defaultLanguage === l.code ? "bg-white/10 text-white font-semibold" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
                            >
                              <span className="flex items-center gap-2.5">
                                <span className="text-base">{l.flag}</span>
                                {l.name}
                              </span>
                              {defaultLanguage === l.code && <Check className="w-4 h-4 text-white shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </SettingRow>

                  {/* Notifications */}
                  <SettingRow
                    title="In-App Notifications"
                    description="Show confirmations and playback activity notifications."
                  >
                    <Toggle
                      checked={notifications}
                      onChange={(v) => setPreference("notifications", v)}
                      label="In-App Notifications"
                    />
                  </SettingRow>
                </div>
              </section>
            )}

            {/* ── 4. SERVERS SECTION ── */}
            {(activeTab === "all" || activeTab === "servers") && (matchesSearch("server order lisbon nebula solara athens joy castle sakura canaias") || !q) && (
              <section id="servers" className="glass-card">
                <div className="section-header flex items-start justify-between gap-4">
                  <div>
                    <h2 className="section-title">Server Order</h2>
                    <p className="section-subtitle">
                      Set which sources are tried first when a title loads. Use arrows to prioritize.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetServerOrder}
                    className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/10 transition-colors shrink-0"
                    title="Reset to default order"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                </div>

                <div className="order-list">
                  {(Array.isArray(serverOrder) ? serverOrder : DEFAULT_SERVER_ORDER).map((sName, idx, arr) => (
                    <div key={sName} className="order-item">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="order-grip" aria-hidden="true">
                          <GripVertical className="w-4 h-4" />
                        </span>
                        <span className="order-name truncate">{sName}</span>
                        {idx === 0 && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Primary
                          </span>
                        )}
                        {idx === 1 && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Fast HD
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveServer(idx, -1)}
                          className="p-1.5 text-white/60 hover:text-white disabled:opacity-20 disabled:hover:text-white/60 rounded-lg hover:bg-white/10 transition-all"
                          aria-label={`Move ${sName} up`}
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === arr.length - 1}
                          onClick={() => moveServer(idx, 1)}
                          className="p-1.5 text-white/60 hover:text-white disabled:opacity-20 disabled:hover:text-white/60 rounded-lg hover:bg-white/10 transition-all"
                          aria-label={`Move ${sName} down`}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── 5. SUBTITLES SECTION ── */}
            {(activeTab === "all" || activeTab === "subtitles") && (matchesSearch("subtitle font size color background blur") || !q) && (
              <section id="subtitles" className="glass-card">
                <div className="section-header">
                  <h2 className="section-title">Subtitles</h2>
                  <p className="section-subtitle">
                    Improve readability and customize your on-screen captions.
                  </p>
                </div>

                <div className="settings-list">
                  {/* Font */}
                  <SettingRow
                    title="Font"
                    description="Choose your preferred subtitle font."
                  >
                    <SegmentControl
                      label="Subtitle Font"
                      options={SUBTITLE_FONTS}
                      value={subtitleFont}
                      onChange={(v) => setPreference("subtitleFont", v)}
                    />
                  </SettingRow>

                  {/* Text Size */}
                  <SettingRow
                    title="Text Size"
                    description="Adjust subtitle size for your display."
                  >
                    <div className="range-wrap">
                      <span className="range-value">{subtitleSize}%</span>
                      <input
                        type="range"
                        min="50"
                        max="150"
                        step="10"
                        value={subtitleSize}
                        onChange={(e) => setPreference("subtitleSize", Number(e.target.value))}
                        className="range-slider"
                        aria-label="Subtitle Size"
                      />
                    </div>
                  </SettingRow>

                  {/* Text Color */}
                  <SettingRow
                    title="Text Color"
                    description="Pick a high-contrast subtitle color."
                  >
                    <div className="color-picker">
                      {SUBTITLE_COLORS.map((c) => {
                        const isSelected = subtitleColor.toLowerCase() === c.value.toLowerCase();
                        return (
                          <button
                            key={c.value}
                            type="button"
                            title={c.name}
                            onClick={() => setPreference("subtitleColor", c.value)}
                            style={{ backgroundColor: c.value }}
                            className={`color-dot${isSelected ? " active" : ""}`}
                            aria-label={`Select ${c.name} subtitle color`}
                          />
                        );
                      })}
                    </div>
                  </SettingRow>

                  {/* Background Blur */}
                  <SettingRow
                    title="Background Blur"
                    description="Improve legibility with a soft glow and drop shadow."
                  >
                    <Toggle
                      checked={subtitleBgBlur}
                      onChange={(v) => setPreference("subtitleBgBlur", v)}
                      label="Background Blur"
                    />
                  </SettingRow>

                  {/* Live Subtitle Preview */}
                  <div className="mt-4 pt-4 border-t border-white/[0.06]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-white/40 block mb-2">
                      Live Preview
                    </span>
                    <div className="relative w-full h-32 rounded-xl overflow-hidden bg-gradient-to-t from-black via-zinc-900 to-black flex items-center justify-center p-4 border border-white/[0.08]">
                      <div
                        className="text-center px-4 py-2 rounded-md max-w-[90%] transition-all"
                        style={{
                          fontFamily: activeFont.family,
                          fontSize: `${(subtitleSize / 100) * 1.05}rem`,
                          color: subtitleColor,
                          textShadow: subtitleBgBlur
                            ? "0 0 4px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.9)"
                            : "0 1px 2px #000",
                          backgroundColor: subtitleBgBlur ? "rgba(0,0,0,0.4)" : "transparent",
                          backdropFilter: subtitleBgBlur ? "blur(4px)" : "none",
                        }}
                      >
                        This is how your subtitles will look on screen.
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ── 6. ADVERTISEMENTS SECTION ── */}
            {(activeTab === "all" || activeTab === "ads") && (matchesSearch("advertisements ads enable") || !q) && (
              <section id="ads" className="glass-card">
                <div className="section-header">
                  <h2 className="section-title">Advertisements</h2>
                  <p className="section-subtitle">
                    Manage how advertisements are displayed on the site.
                  </p>
                </div>

                <div className="settings-list">
                  <SettingRow
                    title="Enable Advertisements"
                    description="Ads help us keep Streamly free for everyone. Consider keeping them enabled to support the project."
                  >
                    <Toggle
                      checked={enableAds}
                      onChange={(v) => setPreference("enableAds", v)}
                      label="Enable Advertisements"
                    />
                  </SettingRow>
                </div>
              </section>
            )}

            {/* ── 7. FEBBOX SECTION ── */}
            {(activeTab === "all" || activeTab === "febbox") && (matchesSearch("febbox integration cookie 4k token") || !q) && (
              <section id="febbox" className="glass-card">
                <div className="section-header">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="section-title !mb-0">Febbox Integration</h2>
                    <button
                      type="button"
                      onClick={() => setShowFebboxGuide(true)}
                      className="fem-info-icon"
                      aria-label="How to get your token"
                    >
                      <CircleHelp className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="section-subtitle">
                    Import your UI cookie from febbox to get access to 4K Streams with no buffers and multiple audio tracks.
                  </p>
                </div>

                <div className="settings-list">
                  <div className="fem-token-row">
                    <div className="flex gap-2">
                      <div className="fem-input-wrap">
                        <input
                          type={showCookie ? "text" : "password"}
                          value={cookieInput}
                          onChange={(e) => setCookieInput(e.target.value)}
                          placeholder="Paste your ui cookie here..."
                          className="fem-token-input pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCookie(!showCookie)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                          aria-label={showCookie ? "Hide cookie" : "Show cookie"}
                        >
                          {showCookie ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveCookie}
                        disabled={cookieInput === (febboxCookie || "") && cookieInput === ""}
                        className="fem-save-btn"
                      >
                        Save
                      </button>
                    </div>

                    {febboxCookie && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400 mt-1">
                        <Check className="w-3.5 h-3.5" />
                        Febbox 4K cookie active and synchronized.
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* ── MODALS ── */}

      {/* Sign In Modal */}
      <AnimatePresence>
        {showSignInModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSignInModal(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              className="relative w-full max-w-md bg-[#141418] border border-white/12 rounded-3xl p-6 shadow-2xl z-10"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-rose-400" />
                  Sign In to Streamly
                </h3>
                <button
                  onClick={() => setShowSignInModal(false)}
                  className="p-1.5 text-white/50 hover:text-white rounded-full hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-white/60 mb-5">
                Sync your watchlist, continue-watching progress, and player configurations across all your devices.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const name = form.elements.name?.value;
                  const email = form.elements.email?.value;
                  handleSignIn(name, email);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/50 block mb-1">
                    Display Name
                  </label>
                  <input
                    name="name"
                    type="text"
                    defaultValue={user?.name || ""}
                    placeholder="Enter your name"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/50 block mb-1">
                    Email Address
                  </label>
                  <input
                    name="email"
                    type="email"
                    defaultValue={user?.email || ""}
                    placeholder="name@domain.com"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-rose-500"
                  />
                </div>
                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSignInModal(false)}
                    className="flex-1 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/80 font-medium text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-full bg-white text-black font-semibold text-sm hover:bg-gray-200 transition-colors shadow-lg"
                  >
                    Sign In
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Trakt Connect Modal */}
      <AnimatePresence>
        {showTraktModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTraktModal(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              className="relative w-full max-w-md bg-[#141418] border border-white/12 rounded-3xl p-6 shadow-2xl z-10"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-red-500/20 text-red-400">
                    <TraktLogo className="w-4 h-4" />
                  </span>
                  Connect Trakt
                </h3>
                <button
                  onClick={() => setShowTraktModal(false)}
                  className="p-1.5 text-white/50 hover:text-white rounded-full hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-white/60 mb-5">
                Automatically scrobble watched titles and synchronize your collection with your Trakt.tv account.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const username = e.currentTarget.elements.traktUser?.value;
                  if (username) handleConnectTrakt(username.trim());
                }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/50 block mb-1">
                    Trakt Username
                  </label>
                  <input
                    name="traktUser"
                    type="text"
                    defaultValue={traktUsername}
                    placeholder="e.g. moviebuff99"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-red-500"
                  />
                </div>
                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowTraktModal(false)}
                    className="flex-1 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/80 font-medium text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors shadow-lg shadow-red-500/30"
                  >
                    Connect Trakt
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Simkl Connect Modal */}
      <AnimatePresence>
        {showSimklModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSimklModal(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              className="relative w-full max-w-md bg-[#141418] border border-white/12 rounded-3xl p-6 shadow-2xl z-10"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                    <SimklLogo className="w-4 h-4" />
                  </span>
                  Connect Simkl
                </h3>
                <button
                  onClick={() => setShowSimklModal(false)}
                  className="p-1.5 text-white/50 hover:text-white rounded-full hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-white/60 mb-5">
                Track anime, movies, and TV shows effortlessly with Simkl's unified database.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const username = e.currentTarget.elements.simklUser?.value;
                  if (username) handleConnectSimkl(username.trim());
                }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/50 block mb-1">
                    Simkl Username
                  </label>
                  <input
                    name="simklUser"
                    type="text"
                    defaultValue={simklUsername}
                    placeholder="e.g. animefan21"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSimklModal(false)}
                    className="flex-1 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/80 font-medium text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm transition-colors shadow-lg shadow-blue-500/30"
                  >
                    Connect Simkl
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Febbox Guide Modal */}
      <AnimatePresence>
        {showFebboxGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFebboxGuide(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              className="relative w-full max-w-md bg-[#141418] border border-white/12 rounded-3xl p-6 shadow-2xl z-10"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <CircleHelp className="w-5 h-5 text-emerald-400" />
                  How to get your Febbox Cookie
                </h3>
                <button
                  onClick={() => setShowFebboxGuide(false)}
                  className="p-1.5 text-white/50 hover:text-white rounded-full hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-sm text-white/80">
                <div className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs shrink-0">1</span>
                  <span>Open <a href="https://www.febbox.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">febbox.com</a> and sign in to your account.</span>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs shrink-0">2</span>
                  <span>Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs font-mono">F12</kbd> (or right click &gt; Inspect) to open Developer Tools.</span>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs shrink-0">3</span>
                  <span>Go to the <strong>Application</strong> (or Storage) tab &gt; <strong>Cookies</strong> &gt; <strong>https://www.febbox.com</strong>.</span>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs shrink-0">4</span>
                  <span>Locate the cookie named <code className="text-amber-400 font-mono">ui</code>, copy its full value, and paste it into the field.</span>
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setShowFebboxGuide(false)}
                  className="w-full py-2.5 rounded-full bg-white text-black font-semibold text-sm hover:bg-gray-200 transition-colors shadow-lg"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
