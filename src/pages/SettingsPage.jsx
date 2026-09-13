import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
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
  Bell,
  LayoutGrid,
  ChevronDown,
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
  Sliders,
  SlidersHorizontal,
} from "lucide-react";
import SEO from "../components/SEO";
import { usePreferences } from "../context/preferences";
import { useToast } from "../components/Toast.jsx";
import { logDebug } from "../utils/debugLogger";
import {
  PLAYER_ZONES,
  PLAYER_CONTROLS,
  PLAYER_CONTROL_ORDER,
  PLAYER_UI_PRESETS,
  resolveUILayout,
  zoneOf,
} from "../components/playerUIDef";

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
  { code: "en", name: "English", flag: "https://flagcdn.com/w40/us.png" },
  { code: "es", name: "Spanish", flag: "https://flagcdn.com/w40/es.png" },
  { code: "fr", name: "French", flag: "https://flagcdn.com/w40/fr.png" },
  { code: "de", name: "German", flag: "https://flagcdn.com/w40/de.png" },
  { code: "it", name: "Italian", flag: "https://flagcdn.com/w40/it.png" },
  { code: "pt", name: "Portuguese", flag: "https://flagcdn.com/w40/br.png" },
  { code: "ja", name: "Japanese", flag: "https://flagcdn.com/w40/jp.png" },
  { code: "ko", name: "Korean", flag: "https://flagcdn.com/w40/kr.png" },
  { code: "hi", name: "Hindi", flag: "https://flagcdn.com/w40/in.png" },
  { code: "ar", name: "Arabic", flag: "https://flagcdn.com/w40/sa.png" },
];

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
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "account", label: "Account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "playback", label: "Playback", icon: Play },
  { id: "servers", label: "Servers", icon: Server },
  { id: "subtitles", label: "Subtitles", icon: Captions },
  { id: "ads", label: "Ads", icon: Megaphone },
  { id: "febbox", label: "Febbox", icon: KeyRound },
  { id: "notifications", label: "Notifications", icon: Bell },
];

function TraktLogo({ className = "w-5 h-5 text-[#ed1c24]" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" className={className} aria-hidden="true">
      <path fill="currentColor" d="m15.082 15.107l-.73-.73l9.578-9.583a5 5 0 0 0-.115-.575L13.662 14.382l1.08 1.08l-.73.73l-1.81-1.81l11.22-11.238c-.075-.15-.155-.3-.25-.44L11.508 14.377l2.154 2.155l-.73.73l-7.193-7.199l.73-.73l4.309 4.31L22.546 1.86A5.62 5.62 0 0 0 18.362 0H5.635A5.637 5.637 0 0 0 0 5.634V18.37A5.63 5.63 0 0 0 5.635 24h12.732C21.477 24 24 21.48 24 18.37V6.19l-8.913 8.918zm-4.314-2.155L6.814 8.988l.73-.73l3.954 3.96zm1.075-1.084l-3.954-3.96l.73-.73l3.959 3.96zm9.853 5.688a4.14 4.14 0 0 1-4.14 4.14H6.438a4.144 4.144 0 0 1-4.139-4.14V6.438A4.14 4.14 0 0 1 6.44 2.3h10.387v1.04H6.438a3.1 3.1 0 0 0-3.099 3.1v11.11c0 1.71 1.39 3.105 3.1 3.105h11.117c1.71 0 3.1-1.395 3.1-3.105v-1.754h1.04v1.754z" />
    </svg>
  );
}

function SimklLogo({ className = "w-5 h-5 text-[#00c2ff]" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" className={className} aria-hidden="true">
      <path fill="currentColor" d="M3.84 0A3.83 3.83 0 0 0 0 3.84v16.32A3.83 3.83 0 0 0 3.84 24h16.32A3.83 3.83 0 0 0 24 20.16V3.84A3.83 3.83 0 0 0 20.16 0zm8.567 4.11q3.11 0 4.393.186q1.69.252 2.438.877q1.009.867 1.009 3.104q0 .241-.01.768h-4.234q-.021-.537-.074-.746q-.147-.615-.966-.692q-.725-.065-3.53-.066q-2.775 0-3.289.165q-.578.2-.578 1.024q0 .792.61.969q.514.143 4.633.275q3.73.11 4.76.275q1.04.165 1.654.495t.983.936q.556.892.557 2.873q0 2.212-.546 3.247q-.547 1.024-1.785 1.398q-1.219.374-6.71.374q-3.338 0-4.82-.187q-1.806-.22-2.593-.86q-.85-.684-1.008-1.93a10.5 10.5 0 0 1-.085-1.434v-.789H7.44q-.01 1.11.43 1.428q.232.151.525.203q.294.056 1.03.077a166 166 0 0 0 2.405.022q2.793-.01 3.234-.033q.83-.065 1.092-.23q.368-.242.368-1.077q0-.57-.231-.802q-.316-.318-1.503-.34q-.82 0-3.425-.132q-2.69-.133-3.488-.154q-2.08-.066-2.932-.505q-1.092-.56-1.429-1.91q-.189-.747-.189-1.956q0-2.547.925-3.59q.693-.79 2.102-1.044q1.271-.22 6.053-.22z" />
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
      role="listbox"
      aria-label="Server priority order"
      aria-orientation="vertical"
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
          role="option"
          aria-selected="false"
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
              role="button"
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

/* ── Player UI Studio ────────────────────────────────────────────────
   Presets + drag-anywhere placement + live subtitle preview. Reads and
   writes the same playerControls / playerUILayout preferences the video
   player renders, so every change previews exactly what will play. */
function PlayerUIStudio() {
  const {
    playerControls = {},
    playerUIPreset = "classic",
    playerUILayout,
    subtitleFont = "cinejoy",
    subtitleSize = 100,
    subtitleColor = "#ffffff",
    subtitleBgBlur = true,
    setPreference,
    setPlayerControl,
  } = usePreferences();
  const { toast } = useToast();
  const layout = resolveUILayout(playerUILayout);
  // Tap-to-move fallback (touch + keyboard users): pick a chip, drop a zone.
  const [pickedKey, setPickedKey] = useState(null);

  const markCustom = () => {
    if (playerUIPreset !== "custom") setPreference("playerUIPreset", "custom");
  };

  const applyPreset = (preset) => {
    setPreference("playerUIPreset", preset.id);
    setPreference("playerUILayout", { ...preset.layout });
    for (const { key } of PLAYER_CONTROLS) {
      setPlayerControl?.(key, preset.visibility[key] !== false);
    }
    logDebug("settings", `Player UI preset applied: ${preset.name}.`, { preset: preset.id });
    toast({
      type: "success",
      title: `${preset.name} layout applied`,
      message: "Player buttons rearranged — preview below matches the player.",
    });
  };

  const moveControl = (key, zoneId) => {
    if (!key || zoneOf(layout, key) === zoneId) return;
    setPreference("playerUILayout", { ...layout, [key]: zoneId });
    markCustom();
    logDebug("settings", `Player control "${key}" moved to ${zoneId}.`, { key, zoneId });
  };

  const toggleControl = (key, val) => {
    setPlayerControl?.(key, val);
    markCustom();
  };

  const onChipDragStart = (e, key) => {
    e.dataTransfer.setData("text/plain", key);
    e.dataTransfer.effectAllowed = "move";
    setPickedKey(key);
  };

  const onZoneDrop = (e, zoneId) => {
    e.preventDefault();
    const key = e.dataTransfer.getData("text/plain") || pickedKey;
    if (key) moveControl(key, zoneId);
    setPickedKey(null);
  };

  const previewFont = SUBTITLE_FONTS.find((f) => f.id === subtitleFont) || SUBTITLE_FONTS[0];

  const PreviewIcon = ({ controlKey, size = 13 }) => {
    const meta = PLAYER_CONTROLS.find((c) => c.key === controlKey);
    if (!meta) return null;
    const Icon = meta.Icon;
    return <Icon style={{ width: size, height: size }} />;
  };

  const renderPreviewCluster = (zoneId) => {
    const keys = PLAYER_CONTROL_ORDER.filter((k) => layout[k] === zoneId && playerControls[k] !== false);
    if (keys.length === 0) return <span className="studio-preview-empty">—</span>;
    return keys.map((k) => (
      <span key={k} className="studio-preview-btn" title={k}>
        {k === "volume" && (zoneId === "bottomLeft" || zoneId === "bottomRight") ? (
          <span className="studio-preview-vol">
            <PreviewIcon controlKey={k} />
            <span className="studio-preview-volbar" />
          </span>
        ) : (
          <PreviewIcon controlKey={k} />
        )}
      </span>
    ));
  };

  return (
    <div className="studio">
      {/* Presets */}
      <p className="studio-label">Preset layouts</p>
      <div className="studio-presets" role="radiogroup" aria-label="Player UI presets">
        {PLAYER_UI_PRESETS.map((preset) => {
          const selected = playerUIPreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => applyPreset(preset)}
              className={`studio-preset${selected ? " is-selected" : ""}`}
            >
              <span className="studio-minimap" aria-hidden="true">
                <span className="studio-minimap-top">
                  <i data-n={zoneCountFor(preset.layout, "topLeft")} />
                  <i data-n={zoneCountFor(preset.layout, "topRight")} />
                </span>
                <span className="studio-minimap-bar" />
                <span className="studio-minimap-bottom">
                  <i data-n={zoneCountFor(preset.layout, "bottomLeft")} />
                  <i data-n={zoneCountFor(preset.layout, "bottomRight")} />
                </span>
              </span>
              <span className="studio-preset-name">{preset.name}</span>
              <span className="studio-preset-blurb">{preset.blurb}</span>
            </button>
          );
        })}
        <div
          className={`studio-preset studio-preset--custom${playerUIPreset === "custom" ? " is-selected" : ""}`}
          aria-hidden={playerUIPreset !== "custom"}
        >
          <span className="studio-preset-name">Custom</span>
          <span className="studio-preset-blurb">
            {playerUIPreset === "custom" ? "Your arrangement — live now" : "Drag anything to create yours"}
          </span>
        </div>
      </div>

      {/* Live preview */}
      <p className="studio-label">Live preview <span className="studio-label-note">matches the player + your subtitles</span></p>
      <div className="studio-preview" aria-label="Player layout preview">
        <div className="studio-preview-screen">
          <div className="studio-preview-top">
            <div className="studio-preview-cluster">{renderPreviewCluster("topLeft")}</div>
            <div className="studio-preview-cluster">{renderPreviewCluster("topRight")}</div>
          </div>
          <div className="studio-preview-play" aria-hidden="true">
            <PreviewIcon controlKey="playPause" size={18} />
          </div>
          <div
            className="studio-preview-sub"
            style={{
              fontFamily: previewFont.family,
              fontSize: `${(Number(subtitleSize) / 100) * 0.85}rem`,
              color: subtitleColor,
              textShadow: subtitleBgBlur
                ? `0 0 8px rgba(0,0,0,0.9), 0 0 14px ${subtitleColor}55, 0 1px 3px #000`
                : "0 1px 3px rgba(0,0,0,0.9)",
              backgroundColor: subtitleBgBlur ? "rgba(0,0,0,0.4)" : "transparent",
            }}
          >
            Here is what your subtitles will look like.
          </div>
          <div className="studio-preview-bottom">
            <div className="studio-preview-progress" aria-hidden="true">
              <span style={{ width: "35%" }} />
            </div>
            <div className="studio-preview-bar">
              <div className="studio-preview-cluster">{renderPreviewCluster("bottomLeft")}</div>
              <div className="studio-preview-cluster">{renderPreviewCluster("bottomRight")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Placement board */}
      <p className="studio-label">Placement <span className="studio-label-note">drag, tap-tap, or use the menu</span></p>
      <div className="studio-zones">
        {PLAYER_ZONES.map((zone) => {
          const keys = PLAYER_CONTROL_ORDER.filter((k) => layout[k] === zone.id);
          const isDropTarget = pickedKey && zoneOf(layout, pickedKey) !== zone.id;
          return (
            <div
              key={zone.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onZoneDrop(e, zone.id)}
              onClick={() => {
                if (pickedKey) {
                  moveControl(pickedKey, zone.id);
                  setPickedKey(null);
                }
              }}
              className={`studio-zone${isDropTarget ? " is-drop-target" : ""}`}
              aria-label={`${zone.label} zone, ${keys.length} controls`}
            >
              <div className="studio-zone-head">
                <span className="studio-zone-name">{zone.label}</span>
                <span className="studio-zone-count">{keys.length}</span>
              </div>
              <p className="studio-zone-blurb">{zone.blurb}</p>
              <div className="studio-chips">
                {keys.length === 0 && <span className="studio-zone-empty">Drop controls here</span>}
                {keys.map((key) => {
                  const meta = PLAYER_CONTROLS.find((c) => c.key === key);
                  const visible = playerControls[key] !== false;
                  const picked = pickedKey === key;
                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={(e) => onChipDragStart(e, key)}
                      onDragEnd={() => setPickedKey(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPickedKey(picked ? null : key);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setPickedKey(picked ? null : key);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-pressed={picked}
                      aria-label={`${meta.label}, in ${zone.label}. Activate to pick up, then choose a zone.`}
                      title="Drag to another zone, or activate and choose a zone"
                      className={`studio-chip${picked ? " is-picked" : ""}${visible ? "" : " is-off"}`}
                    >
                      <GripVertical className="studio-chip-grip" aria-hidden="true" />
                      <meta.Icon className="studio-chip-icon" aria-hidden="true" />
                      <span className="studio-chip-label">{meta.label}</span>
                      <select
                        aria-label={`${meta.label} placement`}
                        value={zone.id}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => moveControl(key, e.target.value)}
                        className="studio-chip-select"
                      >
                        {PLAYER_ZONES.map((z) => (
                          <option key={z.id} value={z.id}>{z.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={visible ? `Hide ${meta.label}` : `Show ${meta.label}`}
                        aria-pressed={visible}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleControl(key, !visible);
                        }}
                        className={`studio-eye${visible ? " is-on" : ""}`}
                      >
                        {visible ? <Eye className="studio-eye-icon" aria-hidden="true" /> : <EyeOff className="studio-eye-icon" aria-hidden="true" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="studio-footnote">
        Hidden controls stay reachable in the player&apos;s settings menu. Volume shows its slider in the
        bottom zones and a compact mute button up top.
      </p>
    </div>
  );
}

function zoneCountFor(layout, zoneId) {
  return PLAYER_CONTROL_ORDER.filter((k) => layout[k] === zoneId).length;
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
  const [showControlsModal, setShowControlsModal] = useState(false);

  // Auth / Accounts state
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("streamly_user");
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      logDebug("settings", "Stored user profile is corrupt — starting signed out.", { message: error?.message });
      return null;
    }
  });
  const [traktUsername, setTraktUsername] = useState(() => {
    try {
      return localStorage.getItem("streamly_trakt") || "";
    } catch (error) {
      logDebug("settings", "Trakt handle unreadable — treating as disconnected.", { message: error?.message });
      return "";
    }
  });
  const [simklUsername, setSimklUsername] = useState(() => {
    try {
      return localStorage.getItem("streamly_simkl") || "";
    } catch (error) {
      logDebug("settings", "Simkl handle unreadable — treating as disconnected.", { message: error?.message });
      return "";
    }
  });

  const {
    // Existing
    autoplay,
    muteTrailers,
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

  // Close dropdowns on outside click or Escape
  const dropdownRef = useRef(null);
  const sectionsTopRef = useRef(null);
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setThemeDropdownOpen(false);
        setSeekDropdownOpen(false);
        setLangDropdownOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        setThemeDropdownOpen(false);
        setSeekDropdownOpen(false);
        setLangDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Lock body scroll while any modal is open + allow Escape to dismiss.
  const anyModalOpen = showFebboxGuide || showSignInModal || showTraktModal || showSimklModal || showControlsModal;
  useEffect(() => {
    if (!anyModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        setShowFebboxGuide(false);
        setShowSignInModal(false);
        setShowTraktModal(false);
        setShowSimklModal(false);
        setShowControlsModal(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [anyModalOpen]);

  const openShortcuts = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true }));
  };

  // Tabs are filters: "All" shows every section, any other tab isolates one.
  // After switching, bring the sections list into view under the sticky bar.
  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    requestAnimationFrame(() => {
      sectionsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
    } catch (error) {
      logDebug("settings", "Sign-in will not persist — storage unavailable.", { message: error?.message });
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
    } catch (error) {
      logDebug("settings", "Stored user could not be cleared.", { message: error?.message });
    }
    toast({
      type: "info",
      title: "Signed Out",
      message: "You have signed out of your account.",
    });
  };

  const handleConnectTrakt = (username) => {
    const name = (username || "").trim();
    if (!name) return;
    setTraktUsername(name);
    try {
      localStorage.setItem("streamly_trakt", name);
    } catch (error) {
      logDebug("settings", "Trakt handle will not persist — storage unavailable.", { message: error?.message });
    }
    setShowTraktModal(false);
    toast({
      type: "success",
      title: "Trakt Connected",
      message: `Connected to Trakt account @${name}.`,
    });
  };

  const handleDisconnectTrakt = () => {
    setTraktUsername("");
    try {
      localStorage.removeItem("streamly_trakt");
    } catch (error) {
      logDebug("settings", "Trakt handle could not be cleared.", { message: error?.message });
    }
    setShowTraktModal(false);
    toast({
      type: "info",
      title: "Trakt Disconnected",
      message: "Your Trakt account was unlinked from this device.",
    });
  };

  const handleConnectSimkl = (username) => {
    const name = (username || "").trim();
    if (!name) return;
    setSimklUsername(name);
    try {
      localStorage.setItem("streamly_simkl", name);
    } catch (error) {
      logDebug("settings", "Simkl handle will not persist — storage unavailable.", { message: error?.message });
    }
    setShowSimklModal(false);
    toast({
      type: "success",
      title: "Simkl Connected",
      message: `Connected to Simkl account @${name}.`,
    });
  };

  const handleDisconnectSimkl = () => {
    setSimklUsername("");
    try {
      localStorage.removeItem("streamly_simkl");
    } catch (error) {
      logDebug("settings", "Simkl handle could not be cleared.", { message: error?.message });
    }
    setShowSimklModal(false);
    toast({
      type: "info",
      title: "Simkl Disconnected",
      message: "Your Simkl account was unlinked from this device.",
    });
  };

  const handleClearCookie = () => {
    setCookieInput("");
    setPreference("febboxCookie", "");
    logDebug("settings", "Febbox cookie cleared — VIP server removed from rotation.");
    toast({
      type: "info",
      title: "Febbox Cookie Removed",
      message: "4K VIP streaming is now disabled.",
    });
  };

  // A section shows when the active tab selects it ("All" shows everything)
  // AND the search filter matches its keywords.
  const visibleSection = (id, keywords) =>
    (activeTab === "all" || activeTab === id) && (!q || keywords.toLowerCase().includes(q));

  const sectionVisible = {
    account: visibleSection("account", "account sign in trakt simkl list history shortcuts user"),
    appearance: visibleSection("appearance", "appearance theme episode style view logo trailer spoiler motion thumbnail"),
    playback: visibleSection("playback", "playback autoplay skip intro controls seek time subtitle language audio mute"),
    servers: visibleSection("servers", "server order lisbon nebula solara athens joy castle sakura canaias stream priority"),
    subtitles: visibleSection("subtitles", "subtitles font size color background blur preview style"),
    ads: visibleSection("ads", "advertisements ads enable support"),
    febbox: visibleSection("febbox", "febbox integration cookie token 4k streams"),
    notifications: visibleSection("notifications", "notifications alert toast popup banner"),
  };
  const nothingVisible = Object.values(sectionVisible).every((v) => !v);

  return (
    <div className="main-content content-page settings-page min-h-screen" ref={dropdownRef}>
      <SEO title="Settings - Streamly" description="Configure player, servers, appearance, subtitles and accounts." />
      <div className="settings-page__glow" aria-hidden="true" />

      <div className="relative z-10 pt-4 md:pt-8 pb-28 px-4 sm:px-6 md:px-10 lg:px-14">
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

          {/* Sticky header bar — search + section tabs stay pinned under the
              navbar while scrolling so every section is always one tap away. */}
          <div className="settings-sticky-bar">
            {/* Quick Search Bar */}
            <div className="mb-3 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter settings..."
                aria-label="Filter settings"
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

            {/* Section Tabs (All + filters) */}
            <nav aria-label="Settings sections" className="settings-nav">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={isActive}
                    className={`settings-tab${isActive ? " is-active" : ""}`}
                    onClick={() => handleTabClick(tab.id)}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sections Stack — filtered by the active tab ("All" shows everything) */}
          <div className="space-y-6 settings-sections" ref={sectionsTopRef}>
            {nothingVisible && (
              <div className="glass-card text-center py-10 px-6" role="status">
                <p className="text-white/80 font-semibold">No settings match{q ? ` “${query.trim()}”` : ""}{activeTab !== "all" ? " in this section" : ""}.</p>
                <p className="section-subtitle mt-1">Try a different search, or switch back to All.</p>
                <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                  {q && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="px-4 py-2 text-xs font-semibold rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    >
                      Clear search
                    </button>
                  )}
                  {activeTab !== "all" && (
                    <button
                      type="button"
                      onClick={() => handleTabClick("all")}
                      className="px-4 py-2 text-xs font-semibold rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    >
                      Show all
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* ── 1. ACCOUNT SECTION ── */}
            {sectionVisible.account && (
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
                          : "Create an account or sign in to sync your data"}
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
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setShowTraktModal(true)}
                        className="flex-1 min-w-0 flex items-center gap-4 px-3 py-3.5 rounded-xl hover:bg-white/[0.04] text-white/80 transition-all text-left"
                      >
                        <div className="w-9 h-9 shrink-0 rounded-full bg-white/[0.06] flex items-center justify-center transition-colors">
                          <TraktLogo />
                        </div>
                        <div className="flex flex-col items-start gap-0.5 text-left min-w-0">
                          <span className="text-[14.5px] font-medium text-white/90">Connect Trakt</span>
                          <span className="text-[13px] text-white/45 truncate">
                            {traktUsername ? `Connected as @${traktUsername}` : "Sync your watchlist, history and progress from Trakt"}
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={() => setShowTraktModal(true)}
                        className="px-4 py-2 text-xs font-semibold rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
                      >
                        {traktUsername ? "Manage" : "Connect"}
                      </button>
                    </div>

                    {/* Simkl */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setShowSimklModal(true)}
                        className="flex-1 min-w-0 flex items-center gap-4 px-3 py-3.5 rounded-xl hover:bg-white/[0.04] text-white/80 transition-all text-left"
                      >
                        <div className="w-9 h-9 shrink-0 rounded-full bg-white/[0.06] flex items-center justify-center transition-colors">
                          <SimklLogo />
                        </div>
                        <div className="flex flex-col items-start gap-0.5 text-left min-w-0">
                          <span className="text-[14.5px] font-medium text-white/90">Connect Simkl</span>
                          <span className="text-[13px] text-white/45 truncate">
                            {simklUsername ? `Connected as @${simklUsername}` : "Sync your watchlist, history and progress from Simkl"}
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={() => setShowSimklModal(true)}
                        className="px-4 py-2 text-xs font-semibold rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
                      >
                        {simklUsername ? "Manage" : "Connect"}
                      </button>
                    </div>
                  </div>

                  {/* Library & Shortcuts navigation */}
                  <div className="mt-2 pt-2 border-t border-white/[0.06] flex flex-col gap-1">
                    <SettingRow title="My Watchlist" description="Your saved movies and television series">
                      <Link
                        to="/watchlist"
                        className="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        View List
                        <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                      </Link>
                    </SettingRow>
                    <SettingRow title="Watch History" description="Recently watched movies, shows, and progress">
                      <Link
                        to="/history"
                        className="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        View History
                        <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                      </Link>
                    </SettingRow>
                    <SettingRow title="Keyboard & Touch Shortcuts" description="Player gestures, swipes, hotkeys, and quick actions">
                      <button
                        type="button"
                        onClick={openShortcuts}
                        className="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Open Guide
                        <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                      </button>
                    </SettingRow>
                  </div>
                </div>
              </section>
            )}

            {/* ── 2. APPEARANCE SECTION ── */}
            {sectionVisible.appearance && (
              <section id="appearance" className="glass-card">
                <div className="section-header">
                  <h2 className="section-title">Appearance</h2>
                  <p className="section-subtitle">
                    Change the look of the site to suit your needs.
                  </p>
                </div>

                <div className="settings-list">
                  {/* Theme */}
                  <div className="setting-row">
                    <div className="setting-meta">
                      <span className="setting-title">Theme</span>
                      <span className="setting-desc">
                        Pick a color palette for the entire interface.
                      </span>
                    </div>
                    <div className="setting-control">
                      <div className="relative theme-dropdown-wrap">
                        <button
                          type="button"
                          aria-expanded={themeDropdownOpen}
                          aria-haspopup="listbox"
                          aria-label={`Theme, current: ${activeTheme.name}`}
                          onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
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
                          <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${themeDropdownOpen ? "rotate-180" : ""}`} />
                        </button>

                        <AnimatePresence>
                          {themeDropdownOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 8, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 8, scale: 0.96 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-[#14121a] border border-white/15 p-2 shadow-2xl backdrop-blur-xl z-50 flex flex-col gap-1 settings-dropdown"
                            >
                              {THEMES.map((t) => {
                                const selected = theme === t.id;
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => {
                                      setPreference("theme", t.id);
                                      setThemeDropdownOpen(false);
                                    }}
                                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                                      selected ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
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
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* Episode View Style */}
                  <SettingRow
                    title="Episode View Style"
                    description="Carousel rails, grids, or lists on series pages."
                  >
                    <SegmentControl
                      label="Episode View Style"
                      options={[
                        { id: "carousel", name: "Carousel" },
                        { id: "grid", name: "Grid" },
                        { id: "list", name: "List" },
                      ]}
                      value={["carousel", "grid", "list"].includes(episodeViewStyle) ? episodeViewStyle : "carousel"}
                      onChange={(val) => setPreference("episodeViewStyle", val)}
                    />
                  </SettingRow>

                  {/* Detail View Type */}
                  <SettingRow
                    title="Detail View Type"
                    description="Full info page, or a Netflix-style quick modal."
                  >
                    <SegmentControl
                      label="Detail View Type"
                      options={[
                        { id: "page", name: "Page" },
                        { id: "modal", name: "Modal" },
                      ]}
                      value={detailViewType}
                      onChange={(val) => setPreference("detailViewType", val)}
                    />
                  </SettingRow>

                  {/* Use Image Logos */}
                  <SettingRow
                    title="Use Image Logos"
                    description="Display movie and series titles as image logos."
                  >
                    <Toggle
                      label="Use Image Logos"
                      checked={useImageLogos}
                      onChange={(val) => setPreference("useImageLogos", val)}
                    />
                  </SettingRow>

                  {/* Trailers */}
                  <SettingRow
                    title="Trailers"
                    description="Play trailers automatically on detail pages and hover previews."
                  >
                    <Toggle
                      label="Trailers"
                      checked={trailers}
                      onChange={(val) => setPreference("trailers", val)}
                    />
                  </SettingRow>

                  {/* Spoiler-Free Mode */}
                  <SettingRow
                    title="Spoiler-Free Mode"
                    description="Hide information about episodes."
                  >
                    <Toggle
                      label="Spoiler-Free Mode"
                      checked={spoilerFreeMode}
                      onChange={(val) => setPreference("spoilerFreeMode", val)}
                    />
                  </SettingRow>

                  {/* Reduce Motion */}
                  <SettingRow
                    title="Reduce Motion"
                    description="Reduce effects."
                  >
                    <Toggle
                      label="Reduce Motion"
                      checked={reduceMotion}
                      onChange={(val) => setPreference("reduceMotion", val)}
                    />
                  </SettingRow>

                  {/* High-Quality Thumbnails */}
                  <SettingRow
                    title="High-Quality Thumbnails"
                    description="Stream higher resolution artwork."
                  >
                    <Toggle
                      label="High-Quality Thumbnails"
                      checked={hdThumbs}
                      onChange={(val) => setPreference("hdThumbs", val)}
                    />
                  </SettingRow>
                </div>
              </section>
            )}

            {/* ── 3. PLAYBACK SECTION ── */}
            {sectionVisible.playback && (
              <section id="playback" className="glass-card">
                <div className="section-header">
                  <h2 className="section-title">Playback</h2>
                  <p className="section-subtitle">
                    Configure how your player behaves.
                  </p>
                </div>

                <div className="settings-list">
                  {/* Autoplay */}
                  <SettingRow
                    title="Autoplay"
                    description="Automatically play the next episode when one ends. Videos still start on their own when this is off."
                  >
                    <Toggle
                      label="Autoplay"
                      checked={autoplay}
                      onChange={(val) => setPreference("autoplay", val)}
                    />
                  </SettingRow>

                  {/* Auto Skip Intro */}
                  <SettingRow
                    title="Auto Skip Intro"
                    description="Jump past the intro on its own, instead of showing the Skip Intro button."
                  >
                    <Toggle
                      label="Auto Skip Intro"
                      checked={autoSkipIntro}
                      onChange={(val) => setPreference("autoSkipIntro", val)}
                    />
                  </SettingRow>

                  {/* Player UI Studio */}
                  <SettingRow
                    title="Player UI Studio"
                    description="Presets, drag buttons anywhere, live subtitle preview."
                  >
                    <button
                      type="button"
                      onClick={() => setShowControlsModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md text-sm font-medium text-white/90 whitespace-nowrap"
                    >
                      <span>Open Studio</span>
                      <ChevronRight className="w-4 h-4 text-white/50" />
                    </button>
                  </SettingRow>

                  {/* Seek Time */}
                  <div className="setting-row">
                    <div className="setting-meta">
                      <span className="setting-title">Seek Time</span>
                      <span className="setting-desc">
                        Change how far you skip forwards or backwards.
                      </span>
                    </div>
                    <div className="setting-control">
                      <div className="relative seek-dropdown-wrap">
                        <button
                          type="button"
                          aria-expanded={seekDropdownOpen}
                          aria-haspopup="listbox"
                          aria-label={`Seek time, current: ${seekTime} seconds`}
                          onClick={() => setSeekDropdownOpen(!seekDropdownOpen)}
                          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md group min-w-[160px] justify-between"
                        >
                          <span className="min-w-0 text-sm font-medium text-white/90 truncate">
                            {seekTime} seconds
                          </span>
                          <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${seekDropdownOpen ? "rotate-180" : ""}`} />
                        </button>

                        <AnimatePresence>
                          {seekDropdownOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 8, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 8, scale: 0.96 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 top-full mt-2 w-44 rounded-2xl bg-[#14121a] border border-white/15 p-2 shadow-2xl backdrop-blur-xl z-50 flex flex-col gap-1 settings-dropdown"
                            >
                              {SEEK_TIMES.map((st) => {
                                const selected = Number(seekTime) === st.value;
                                return (
                                  <button
                                    key={st.value}
                                    type="button"
                                    onClick={() => {
                                      setPreference("seekTime", st.value);
                                      setSeekDropdownOpen(false);
                                    }}
                                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                                      selected ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                                    }`}
                                  >
                                    <span>{st.label}</span>
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
                    title="Auto Subtitles"
                    description="Automatically select subtitles in your preferred language when available."
                  >
                    <Toggle
                      label="Auto Subtitles"
                      checked={autoSubtitles}
                      onChange={(val) => setPreference("autoSubtitles", val)}
                    />
                  </SettingRow>

                  {/* Default Language */}
                  <div className="setting-row">
                    <div className="setting-meta">
                      <span className="setting-title">Default Language</span>
                      <span className="setting-desc">
                        Choose the subtitle language to auto-select.
                      </span>
                    </div>
                    <div className="setting-control">
                      <div className="relative lang-dropdown-wrap">
                        <button
                          type="button"
                          aria-expanded={langDropdownOpen}
                          aria-haspopup="listbox"
                          aria-label={`Default subtitle language, current: ${activeLang.name}`}
                          onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md group min-w-[160px] justify-between"
                        >
                          <span className="flex items-center gap-2.5 min-w-0 text-sm font-medium text-white/90">
                            <img
                              alt=""
                              className="w-5 h-3.5 rounded-[3px] object-cover shrink-0"
                              src={activeLang.flag}
                            />
                            <span className="truncate">{activeLang.name}</span>
                          </span>
                          <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${langDropdownOpen ? "rotate-180" : ""}`} />
                        </button>

                        <AnimatePresence>
                          {langDropdownOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 8, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 8, scale: 0.96 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 top-full mt-2 w-52 max-h-60 overflow-y-auto rounded-2xl bg-[#14121a] border border-white/15 p-2 shadow-2xl backdrop-blur-xl z-50 flex flex-col gap-1 settings-dropdown"
                            >
                              {LANGUAGES.map((l) => {
                                const selected = defaultLanguage === l.code;
                                return (
                                  <button
                                    key={l.code}
                                    type="button"
                                    onClick={() => {
                                      setPreference("defaultLanguage", l.code);
                                      setLangDropdownOpen(false);
                                    }}
                                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                                      selected ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                                    }`}
                                  >
                                    <span className="flex items-center gap-2.5">
                                      <img
                                        alt=""
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
                    title="Mute Trailer Audio"
                    description="Open trailers with sound off by default."
                  >
                    <Toggle
                      label="Mute Trailer Audio"
                      checked={muteTrailers}
                      onChange={(val) => setPreference("muteTrailers", val)}
                    />
                  </SettingRow>
                </div>
              </section>
            )}

            {/* ── 4. SERVER ORDER SECTION ── */}
            {sectionVisible.servers && (
              <section id="servers" className="glass-card">
                <div className="section-header flex items-center justify-between">
                  <div>
                    <h2 className="section-title">Server Order</h2>
                    <p className="section-subtitle">
                      Drag the handle to set which sources are tried first when a title loads. The same order plays in the video player.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetServerOrder}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white/70 hover:text-white transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>

                <ServerOrderList list={serverList} onReorder={reorderServers} onMoveKeyboard={moveServerKeyboard} />
              </section>
            )}

            {/* ── 5. SUBTITLES SECTION ── */}
            {sectionVisible.subtitles && (
              <section id="subtitles" className="glass-card">
                <div className="section-header">
                  <h2 className="section-title">Subtitles</h2>
                  <p className="section-subtitle">
                    Improve readability and customization for subtitles.
                  </p>
                </div>

                <div className="settings-list">
                  {/* Font */}
                  <SettingRow
                    title="Font"
                    description="Choose your preferred subtitle font."
                  >
                    <SegmentControl
                      label="Font"
                      options={SUBTITLE_FONTS}
                      value={subtitleFont}
                      onChange={(val) => setPreference("subtitleFont", val)}
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
                        aria-label={`Subtitle text size, ${subtitleSize} percent`}
                        onChange={(e) => setPreference("subtitleSize", Number(e.target.value))}
                        className="range-slider"
                      />
                    </div>
                  </SettingRow>

                  {/* Text Color */}
                  <SettingRow
                    title="Text Color"
                    description="Pick a high-contrast subtitle color."
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

                  {/* Background Blur */}
                  <SettingRow
                    title="Background Blur"
                    description="Improve legibility with a soft glow."
                  >
                    <Toggle
                      label="Background Blur"
                      checked={subtitleBgBlur}
                      onChange={(val) => setPreference("subtitleBgBlur", val)}
                    />
                  </SettingRow>

                  {/* Real-time Subtitle Live Preview Box */}
                  <div className="mt-4 p-5 rounded-2xl bg-black/60 border border-white/10 relative overflow-hidden flex flex-col items-center justify-center min-h-[140px] text-center">
                    <div
                      className="absolute inset-0 bg-cover bg-center opacity-30 pointer-events-none"
                      style={{
                        backgroundImage:
                          "url('https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&q=80')",
                      }}
                    />
                    <div className="relative z-10">
                      <span
                        style={{
                          fontFamily: activeFont.family,
                          fontSize: `${(Number(subtitleSize) / 100) * 1.15}rem`,
                          color: subtitleColor,
                          textShadow: subtitleBgBlur
                            ? `0 0 10px rgba(0,0,0,0.9), 0 0 20px ${subtitleColor}55, 0 2px 4px #000`
                            : "0 2px 4px rgba(0,0,0,0.9)",
                          backgroundColor: subtitleBgBlur ? "rgba(0,0,0,0.4)" : "transparent",
                          padding: "4px 12px",
                          borderRadius: "8px",
                          display: "inline-block",
                          lineHeight: 1.4,
                        }}
                      >
                        Here is what your subtitles will look like.
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ── 6. ADVERTISEMENTS SECTION ── */}
            {sectionVisible.ads && (
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
                    description="Ads help us keep Cinejoy free for everyone. Consider keeping them enabled to support the site."
                  >
                    <Toggle
                      label="Enable Advertisements"
                      checked={enableAds}
                      onChange={(val) => setPreference("enableAds", val)}
                    />
                  </SettingRow>
                </div>
              </section>
            )}

            {/* ── 7. FEBBOX INTEGRATION SECTION ── */}
            {sectionVisible.febbox && (
              <section id="febbox" className="glass-card">
                <div className="section-header flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="section-title">Febbox Integration</h2>
                    <div className="fem-guide-anchor">
                      <button
                        type="button"
                        onClick={() => setShowFebboxGuide(true)}
                        aria-label="How to get your token"
                        className="fem-info-icon"
                      >
                        <CircleHelp className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <p className="section-subtitle mb-4">
                  Import your UI cookie from febbox to get access to 4K Streams with no buffers and multiple audio tracks.
                </p>

                <div className="fem-token-row">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1"
                      >
                        {showCookie ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveCookie}
                      disabled={!cookieInput.trim() || cookieInput === febboxCookie}
                      className="fem-save-btn"
                    >
                      Save
                    </button>
                    {febboxCookie && (
                      <button
                        type="button"
                        onClick={handleClearCookie}
                        className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors whitespace-nowrap"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {febboxCookie && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 mt-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Cookie active and authenticated</span>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── 8. IN-APP NOTIFICATIONS ── */}
            {sectionVisible.notifications && (
              <section id="notifications" className="glass-card">
                <div className="section-header">
                  <h2 className="section-title">Notifications</h2>
                  <p className="section-subtitle">
                    Control in-app status updates, scrobble confirmations, and activity notifications.
                  </p>
                </div>

                <div className="settings-list">
                  <SettingRow
                    title="Show in-app notifications"
                    description="Display brief status toasts when items are added to watchlist, servers change, or progress is saved."
                  >
                    <Toggle
                      label="Show in-app notifications"
                      checked={notifications}
                      onChange={(val) => setPreference("notifications", val)}
                    />
                  </SettingRow>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* ── MODALS ── */}

      {/* Sign-In Modal */}
      <AnimatePresence>
        {showSignInModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-[#13111c] border border-white/15 rounded-3xl p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setShowSignInModal(false)}
                className="absolute right-5 top-5 p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Sign In to Streamly</h3>
                  <p className="text-xs text-white/50">Sync preferences and watchlist across all devices.</p>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  // NOTE: form.name would resolve to the form's own `name`
                  // attribute (a string), never the input — read via FormData.
                  const data = new FormData(e.target);
                  handleSignIn(data.get("name"), data.get("email"));
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-white/70 mb-1.5">Your Name</label>
                  <input
                    name="name"
                    type="text"
                    required
                    defaultValue="Streamly Viewer"
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-white/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/70 mb-1.5">Email Address</label>
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue="viewer@streamly.io"
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-white/30"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSignInModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-white text-black hover:bg-gray-200 text-sm font-bold transition-colors shadow-lg"
                  >
                    Sign In
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Trakt Connection Modal */}
      <AnimatePresence>
        {showTraktModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-[#13111c] border border-white/15 rounded-3xl p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setShowTraktModal(false)}
                className="absolute right-5 top-5 p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-[#ed1c24]/20 flex items-center justify-center text-[#ed1c24]">
                  <TraktLogo className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Connect Trakt</h3>
                  <p className="text-xs text-white/50">Two-way sync for movies, episodes, and history.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/70 mb-1.5">Trakt Username</label>
                  <input
                    id="trakt-input"
                    type="text"
                    defaultValue={traktUsername}
                    placeholder="Enter your Trakt username..."
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-white/30"
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/5 text-xs text-white/60 leading-relaxed">
                  Streamly will record watching progress, automatically track finished episodes, and retrieve your Trakt watchlist.
                </div>

                <div className="flex gap-3">
                  {traktUsername && (
                    <button
                      type="button"
                      onClick={handleDisconnectTrakt}
                      className="py-2.5 px-4 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-xs font-semibold"
                    >
                      Disconnect
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const val = document.getElementById("trakt-input")?.value?.trim();
                      if (val) handleConnectTrakt(val);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-[#ed1c24] text-white hover:bg-[#d91920] text-sm font-bold shadow-lg"
                  >
                    Save Connection
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Simkl Connection Modal */}
      <AnimatePresence>
        {showSimklModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-[#13111c] border border-white/15 rounded-3xl p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setShowSimklModal(false)}
                className="absolute right-5 top-5 p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-[#00c2ff]/20 flex items-center justify-center text-[#00c2ff]">
                  <SimklLogo className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Connect Simkl</h3>
                  <p className="text-xs text-white/50">Synchronize anime, movies, and TV show watchlists.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/70 mb-1.5">Simkl Username / ID</label>
                  <input
                    id="simkl-input"
                    type="text"
                    defaultValue={simklUsername}
                    placeholder="Enter your Simkl handle..."
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-white/30"
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/5 text-xs text-white/60 leading-relaxed">
                  Automatic scrobbling ensures everything you watch on Streamly updates on your Simkl profile instantly.
                </div>

                <div className="flex gap-3">
                  {simklUsername && (
                    <button
                      type="button"
                      onClick={handleDisconnectSimkl}
                      className="py-2.5 px-4 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-xs font-semibold"
                    >
                      Disconnect
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const val = document.getElementById("simkl-input")?.value?.trim();
                      if (val) handleConnectSimkl(val);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-[#00c2ff] text-black hover:bg-[#00ade4] text-sm font-bold shadow-lg"
                  >
                    Save Connection
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Febbox Extraction Guide Modal */}
      <AnimatePresence>
        {showFebboxGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg bg-[#13111c] border border-white/15 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setShowFebboxGuide(false)}
                className="absolute right-5 top-5 p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">How to Get Your Febbox Token</h3>
                  <p className="text-xs text-white/50">Follow these steps to enable ultra-fast 4K streaming.</p>
                </div>
              </div>

              <div className="space-y-4 text-xs text-white/80 leading-relaxed">
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/5 space-y-2">
                  <div className="font-bold text-white text-sm">Step 1: Open Febbox</div>
                  <p>Navigate to <a href="https://www.febbox.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline">febbox.com</a> and make sure you are logged into your account.</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/5 space-y-2">
                  <div className="font-bold text-white text-sm">Step 2: Copy your ui_cookie</div>
                  <p>Press <code className="bg-white/10 px-1.5 py-0.5 rounded text-white">F12</code> to open Developer Tools, switch to the <b>Application</b> (or <b>Storage</b>) tab, expand <b>Cookies</b>, and copy the value of the cookie named <code className="bg-white/10 px-1.5 py-0.5 rounded text-white">ui</code>.</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/5 space-y-2">
                  <div className="font-bold text-white text-sm">Step 3: Paste and Save</div>
                  <p>Paste your cookie token into the input box on this Settings page and click <b>Save</b>.</p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowFebboxGuide(false)}
                  className="w-full py-2.5 rounded-xl bg-white text-black hover:bg-gray-200 text-sm font-bold transition-colors"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Player UI Studio Modal */}
      <AnimatePresence>
        {showControlsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              role="dialog"
              aria-modal="true"
              aria-label="Player UI studio"
              className="w-full max-w-3xl bg-[#13111c] border border-white/15 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setShowControlsModal(false)}
                aria-label="Close player studio"
                className="absolute right-5 top-5 p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Player UI Studio</h3>
                  <p className="text-xs text-white/50">Presets, drag buttons anywhere, live subtitle preview.</p>
                </div>
              </div>

              <PlayerUIStudio />

              <button
                type="button"
                onClick={() => {
                  setShowControlsModal(false);
                  toast({
                    type: "success",
                    title: "Player Studio Saved",
                    message: "Your player layout is live on the next video.",
                  });
                }}
                className="w-full py-2.5 rounded-xl bg-white text-black hover:bg-gray-200 text-sm font-bold transition-colors mt-4"
              >
                Done
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
