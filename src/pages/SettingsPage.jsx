import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
  Bell,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Search,
  GripVertical,
  RotateCcw,
  Eye,
  EyeOff,
  LogOut,
  Bookmark,
  Clock,
  Sliders,
  SlidersHorizontal,
} from "lucide-react";
import SEO from "../components/SEO";
import PlayerPreview from "../components/PlayerPreview.jsx";
import { usePreferences } from "../context/preferences";
import { useAppAuth } from "../context/auth";
import GoogleSignInButton, { GoogleLogoIcon } from "../components/GoogleSignInButton.jsx";
import { useToast } from "../components/Toast.jsx";
import { useConfirmDialog } from "../components/ConfirmDialog.jsx";
import { logDebug } from "../utils/debugLogger";
import {
  PLAYER_ZONES,
  PLAYER_CONTROLS,
  PLAYER_CONTROL_ORDER,
  PLAYER_UI_PRESETS,
  resolveUILayout,
  zoneOf,
  presetById,
  resolveSkin,
  ICON_VARIANTS,
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

/* Mirrors DEFAULT_PREFERENCES.serverOrder (restored Server 1 … Server 8
   labels). Kept local so the Settings page renders before the provider
   resolves; the adapter owns the authoritative list. */
const DEFAULT_SERVER_ORDER = [
  "Server 1",
  "Server 2 (Fast)",
  "Server 3 (HD)",
  "Server 4 (Backup)",
  "Server 5 (VidCore)",
  "Server 6 (Peachify)",
  "Server 7 (VidUp)",
  "Server 8 (Smashy)",
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
    playerUISkin = "classic",
    playerGlobalIconStyle = "auto",
    playerUILayout,
    playerIconVariants = {},
    setPreference,
    setPlayerControl,
  } = usePreferences();
  const { toast } = useToast();
  const layout = resolveUILayout(playerUILayout);
  // Tap-to-move fallback (touch + keyboard users): pick a chip, drop a zone.
  const [pickedKey, setPickedKey] = useState(null);

  const setIconVariant = (key, variantId) => {
    setPreference("playerIconVariants", { ...playerIconVariants, [key]: variantId });
  };

  const markCustom = () => {
    if (playerUIPreset !== "custom") {
      setPreference("playerUISkin", playerUIPreset);
      setPreference("playerUIPreset", "custom");
    }
  };

  const applyPreset = (preset) => {
    setPreference("playerUIPreset", preset.id);
    setPreference("playerUISkin", preset.skinId || preset.id);
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

  /* previewFont/PreviewIcon/renderPreviewCluster are retired — the live
     preview is now the shared PlayerPreview mini-player (demo video +
     real zone chrome, styled from the same preferences). */

  return (
    <div className="studio">
      {/* Presets */}
      <p className="studio-label">Preset layouts <span className="studio-label-note">each with its own end-to-end skin</span></p>
      <div className="studio-presets" role="radiogroup" aria-label="Player UI presets">
        {PLAYER_UI_PRESETS.map((preset) => {
          const selected = playerUIPreset === preset.id;
          const presetSkin = resolveSkin(preset.skinId);
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => applyPreset(preset)}
              className={`studio-preset${selected ? " is-selected" : ""}`}
            >
              {preset.id === "apple" ? (
                <span className="studio-minimap studio-minimap--apple" aria-hidden="true">
                  <span className="studio-minimap-island">
                    <i /><i /><i />
                  </span>
                </span>
              ) : preset.id === "material" ? (
                <span className="studio-minimap studio-minimap--material" aria-hidden="true">
                  <span className="studio-minimap-tonal">
                    <i /><span className="fab" /><i />
                  </span>
                </span>
              ) : preset.id === "minimal" ? (
                <span className="studio-minimap studio-minimap--minimal" aria-hidden="true">
                  <span className="studio-minimap-center">
                    <i /><i /><i />
                  </span>
                  <span className="studio-minimap-capsule" />
                </span>
              ) : preset.id === "compact" ? (
                <span className="studio-minimap studio-minimap--compact" aria-hidden="true">
                  <span className="studio-minimap-body">
                    <span className="studio-minimap-dock" />
                    <span className="studio-minimap-rail">
                      <i /><i /><i />
                    </span>
                  </span>
                </span>
              ) : preset.id === "theater" ? (
                <span className="studio-minimap studio-minimap--theater" aria-hidden="true">
                  <span className="studio-minimap-marquee" />
                  <span className="studio-minimap-stage">
                    <i /><i /><i />
                  </span>
                  <span className="studio-minimap-bar" style={{ background: "linear-gradient(90deg, #ffd166, #ff9e2c)" }} />
                </span>
              ) : preset.id === "studio" ? (
                <span className="studio-minimap studio-minimap--studio" aria-hidden="true">
                  <span className="studio-minimap-topline" />
                  <span className="studio-minimap-ruler" />
                  <span className="studio-minimap-console">
                    <i /><i /><i /><i />
                  </span>
                </span>
              ) : (
                <span className="studio-minimap studio-minimap--classic" aria-hidden="true">
                  <span className="studio-minimap-top">
                    <i data-n={zoneCountFor(preset.layout, "topLeft")} />
                    <i data-n={zoneCountFor(preset.layout, "topRight")} />
                  </span>
                  <span className="studio-minimap-bar" />
                  <span className="studio-minimap-bottom">
                    <i data-n={zoneCountFor(preset.layout, "bottomLeft")} />
                    <i data-n={zoneCountFor(preset.layout, "bottomCenter")} />
                    <i data-n={zoneCountFor(preset.layout, "bottomRight")} />
                  </span>
                </span>
              )}
              <span className="studio-preset-name">{preset.name}</span>
              {preset.tagline && (
                <span className="studio-preset-archetype">{preset.tagline}</span>
              )}
              <span className="studio-preset-blurb">{preset.blurb}</span>
              <span
                className="studio-preset-swatch"
                aria-hidden="true"
                style={{
                  background: presetSkin.progressFill,
                  boxShadow: presetSkin.progressGlow !== "none" ? presetSkin.progressGlow : undefined,
                }}
              />
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

      {/* Live preview — real demo video + the exact zone chrome the
          player renders. Re-renders instantly on preset click, drag,
          tap-to-move, and eye toggles (same preferences + live state). */}
      <p className="studio-label">Live preview <span className="studio-label-note">demo video · matches the player</span></p>
      <PlayerPreview
        layout={layout}
        visibility={playerControls}
        label={playerUIPreset === "custom" ? `Custom (${PLAYER_UI_PRESETS.find((p) => p.id === playerUISkin)?.name || "Classic"})` : (presetById(playerUIPreset)?.name || "Classic")}
        presetId={playerUIPreset}
        playerUISkin={playerUISkin}
        draggable={true}
        iconVariants={playerIconVariants}
        onZoneDrop={(key, zoneId) => moveControl(key, zoneId)}
        onChipDragStart={(e, key) => { e.dataTransfer.setData("text/plain", key); setPickedKey(key); }}
      />

      {/* Visual archetype selection when in custom layout mode */}
      {playerUIPreset === "custom" && (
        <div className="studio-archetype-row">
          <p className="studio-label" style={{ marginBottom: 6 }}>
            Custom layout archetype <span className="studio-label-note">visual styling for your custom layout</span>
          </p>
          <div className="studio-style-pills">
            {PLAYER_UI_PRESETS.map((p) => {
              const active = (playerUISkin || "classic") === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`studio-style-pill${active ? " is-active" : ""}`}
                  onClick={() => {
                    setPreference("playerUISkin", p.id);
                    toast({
                      type: "success",
                      title: `${p.name} look applied`,
                      message: `Restyled your custom arrangement with ${p.name} aesthetics.`,
                    });
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Global Icon Style picker */}
      <div className="studio-global-icons">
        <p className="studio-label" style={{ marginBottom: 6 }}>
          Icon Style <span className="studio-label-note">apply style to all controls or tune each below</span>
        </p>
        <div className="studio-style-pills">
          <button
            type="button"
            className={`studio-style-pill${playerGlobalIconStyle === "auto" ? " is-active" : ""}`}
            onClick={() => {
              setPreference("playerGlobalIconStyle", "auto");
              setPreference("playerIconVariants", {});
            }}
          >
            Auto (Preset Default)
          </button>
          {ICON_VARIANTS.map((v) => {
            const active = playerGlobalIconStyle === v.id;
            return (
              <button
                key={v.id}
                type="button"
                className={`studio-style-pill${active ? " is-active" : ""}`}
                onClick={() => {
                  setPreference("playerGlobalIconStyle", v.id);
                  const bulk = {};
                  for (const { key } of PLAYER_CONTROLS) {
                    bulk[key] = v.id;
                  }
                  setPreference("playerIconVariants", bulk);
                }}
                title={v.desc}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="studio-label">Controls <span className="studio-label-note">drag onto the preview · pick icon style</span></p>
      <div
        className="studio-palette"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => {
          e.preventDefault();
          const k = e.dataTransfer.getData("text/plain");
          if (k) moveControl(k, "tray");
        }}
      >
        {PLAYER_CONTROL_ORDER.map((key) => {
          const meta = PLAYER_CONTROLS.find((c) => c.key === key);
          if (!meta) return null;
          const visible = playerControls[key] !== false;
          const variant = playerIconVariants[key] || "outline";
          const zone = layout[key] || "tray";
          const inTray = zone === "tray";
          const picked = pickedKey === key;
          return (
            <div
              key={key}
              draggable
              onDragStart={(e) => onChipDragStart(e, key)}
              onDragEnd={() => setPickedKey(null)}
              onClick={(e) => { e.stopPropagation(); setPickedKey(picked ? null : key); }}
              className={`studio-palette-chip${picked ? " is-active" : ""}${inTray ? " is-in-tray" : ""}`}
              title={`${meta.label} — drag onto the preview to place`}
            >
              <div className={`studio-palette-chip-icon is-${variant}`}>
                <meta.Icon size={16} />
              </div>
              <span className="studio-palette-chip-label">{meta.label}</span>
              {!inTray && (
                <span className="studio-palette-chip-zone">{PLAYER_ZONES.find((z) => z.id === zone)?.label}</span>
              )}
              {/* Icon variant picker */}
              <div className="studio-chip-variants">
                {ICON_VARIANTS.map((v) => (
                  <button
                    key={v.id}
                    data-v={v.id}
                    title={v.label}
                    className={`studio-chip-variant${variant === v.id ? " is-active" : ""}`}
                    onClick={(e) => { e.stopPropagation(); setIconVariant(key, v.id); }}
                  />
                ))}
              </div>
              {/* Eye toggle */}
              <button
                type="button"
                aria-label={visible ? `Hide ${meta.label}` : `Show ${meta.label}`}
                onClick={(e) => { e.stopPropagation(); toggleControl(key, !visible); }}
                className={`studio-eye${visible ? " is-on" : ""}`}
              >
                {visible ? <Eye className="studio-eye-icon" /> : <EyeOff className="studio-eye-icon" />}
              </button>
              {/* Accessible zone select */}
              <select
                aria-label={`${meta.label} placement`}
                value={zone}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => moveControl(key, e.target.value)}
                className="studio-chip-select"
              >
                {PLAYER_ZONES.map((z) => (
                  <option key={z.id} value={z.id}>{z.label}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <p className="studio-footnote">
        Hidden controls stay reachable in the player&apos;s settings menu. Volume shows its full slider on
        the outer bottom corners and a compact mute button everywhere else.
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
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showControlsModal, setShowControlsModal] = useState(false);

  // Auth / Accounts state
  const auth = useAppAuth();
  const [localUser, setLocalUser] = useState(() => {
    try {
      const stored = localStorage.getItem("streamly_user");
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      logDebug("settings", "Stored user profile is corrupt — starting signed out.", { message: error?.message });
      return null;
    }
  });
  const user = auth?.user || localUser;

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
    // Subtitles (live-controls the Subtitles section below)
    subtitleFont = "cinejoy",
    subtitleSize = 100,
    subtitleColor = "#ffffff",
    subtitleBgBlur = true,
    // Setter
    setPreference,
    resetPreferences,
  } = usePreferences();

  const { confirmDialog, ConfirmDialogRenderer } = useConfirmDialog();

  const q = useMemo(() => query.trim().toLowerCase(), [query]);

  const activeTheme = useMemo(
    () => THEMES.find((t) => t.id === theme) || THEMES[0],
    [theme],
  );

  const activeLang = useMemo(
    () => LANGUAGES.find((l) => l.code === defaultLanguage) || LANGUAGES[0],
    [defaultLanguage],
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
  const anyModalOpen = showSignInModal || showControlsModal;
  useEffect(() => {
    if (!anyModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        setShowSignInModal(false);
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

  const handleResetAllPreferences = async () => {
    const confirmed = await confirmDialog({
      title: "Reset All Preferences?",
      message:
        "This will restore your theme, player layout, and playback preferences to default settings. Your saved watchlist and watch history will remain untouched.",
      confirmLabel: "Reset to Defaults",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    resetPreferences?.();
    toast({
      type: "success",
      title: "Preferences Reset",
      message: "All settings have been restored to defaults.",
    });
  };

  // Modal Sign-in actions
  const handleSignIn = (name, email) => {
    if (auth?.loginAsGuest) {
      auth.loginAsGuest(name, email);
    }
    const u = { name: name || "Streamly User", email: email || "user@streamly.io", provider: "guest" };
    setLocalUser(u);
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
    if (auth?.logout) {
      auth.logout();
    }
    setLocalUser(null);
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

  // A section shows when the active tab selects it ("All" shows everything)
  // AND the search filter matches its keywords.
  const visibleSection = (id, keywords) =>
    (activeTab === "all" || activeTab === id) && (!q || keywords.toLowerCase().includes(q));

  const sectionVisible = {
    account: visibleSection("account", "account sign in list history shortcuts user"),
    appearance: visibleSection("appearance", "appearance theme episode style view logo trailer spoiler motion thumbnail"),
    playback: visibleSection("playback", "playback autoplay skip intro controls seek time subtitle language audio mute"),
    servers: visibleSection("servers", "server order server 1 fast hd backup vidcore peachify vidup smashy stream priority"),
    subtitles: visibleSection("subtitles", "subtitles font size color background blur preview style"),
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
                      className="px-4 py-2 text-xs font-semibold rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors border-none"
                    >
                      Clear search
                    </button>
                  )}
                  {activeTab !== "all" && (
                    <button
                      type="button"
                      onClick={() => handleTabClick("all")}
                      className="px-4 py-2 text-xs font-semibold rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors border-none"
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
                            {user ? user.name || user.email : "Not signed in"}
                          </span>
                          {user?.provider === "google" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                              <GoogleLogoIcon size={11} /> Google
                            </span>
                          )}
                        </div>
                        <span className="setting-desc">
                          {user
                            ? user.email || "Your profile and library are actively synchronized."
                            : "Sign in with Google to sync your watchlist and settings across devices."}
                        </span>
                      </div>
                    </div>
                    <div className="setting-control flex items-center gap-2">
                      {user ? (
                        <button
                          onClick={handleSignOut}
                          className="px-4 py-2 text-[13.5px] font-semibold rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5 border-none cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <GoogleSignInButton
                            onSuccess={() => setShowSignInModal(false)}
                            className="hidden sm:block"
                            style={{ minWidth: 200 }}
                            text="Sign in with Google"
                          />
                          <button
                            onClick={() => setShowSignInModal(true)}
                            className="px-5 py-2.5 text-[14px] font-semibold rounded-full bg-white text-black hover:bg-gray-100 transition-colors shadow-[0_2px_10px_rgba(255,255,255,0.1)] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/30 border-none cursor-pointer"
                          >
                            Sign In
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Database Cloud Sync Status */}
                  <div className="setting-row mt-2 pt-2 border-t border-white/[0.06]">
                    <div className="setting-meta">
                      <div className="flex items-center gap-2">
                        <span className="setting-title">MongoDB Cloud Sync</span>
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Atlas Connected
                        </span>
                      </div>
                      <span className="setting-desc">
                        {user
                          ? auth?.syncStatus === "syncing"
                            ? "Synchronizing watchlist and history with MongoDB cluster..."
                            : auth?.lastSyncedAt
                            ? `Last synced: ${new Date(auth.lastSyncedAt).toLocaleTimeString()}`
                            : "Your library and watch history automatically synchronize to MongoDB."
                          : "Cloud database connected. Sign in with Google to synchronize your library."}
                      </span>
                    </div>
                    {user && (
                      <div className="setting-control">
                        <button
                          onClick={() => {
                            auth?.syncToCloud?.();
                            toast({
                              type: "success",
                              title: "Cloud Sync Initiated",
                              message: "Your watchlist and progress are synchronizing to MongoDB.",
                            });
                          }}
                          disabled={auth?.syncStatus === "syncing"}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-full bg-white/10 hover:bg-white/15 text-white transition-colors flex items-center gap-1.5 border border-white/10 cursor-pointer disabled:opacity-50"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${auth?.syncStatus === "syncing" ? "animate-spin" : ""}`} />
                          Sync Now
                        </button>
                      </div>
                    )}
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
                        className="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white text-xs font-medium flex items-center gap-1 transition-colors border-none"
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
                              className="absolute right-0 top-full mt-2 w-56 rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1 settings-dropdown"
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
                              className="absolute right-0 top-full mt-2 w-44 rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1 settings-dropdown"
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
                                      selected ? "settings-dropdown-item is-selected" : "settings-dropdown-item text-white/70 hover:text-white"
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
                              className="absolute right-0 top-full mt-2 w-52 max-h-60 overflow-y-auto rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1 settings-dropdown"
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
                                      selected ? "settings-dropdown-item is-selected" : "settings-dropdown-item text-white/70 hover:text-white"
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

                  {/* Real-time Subtitle Live Preview Box — the same demo-video
                      mini-player as the Studio (video + live subtitle styles). */}
                  <div className="mt-4">
                    <PlayerPreview showChrome={false} label="Subtitles" />
                  </div>
                </div>
              </section>
            )}

            {/* ── 6. IN-APP NOTIFICATIONS ── */}
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

            {/* ── 7. FACTORY RESET PREFERENCES ── */}
            {(activeTab === "all" || activeTab === "account") && (
              <section id="reset-preferences" className="glass-card" style={{ border: "1px solid rgba(244, 63, 94, 0.25)" }}>
                <div className="section-header">
                  <h2 className="section-title" style={{ color: "#f87171" }}>Reset All Preferences</h2>
                  <p className="section-subtitle">
                    Restore theme, player layout, and playback preferences back to factory defaults. Your My List and Watch History will not be affected.
                  </p>
                </div>

                <div className="settings-list">
                  <SettingRow
                    title="Factory Reset Preferences"
                    description="Clears custom themes, subtitle styling, player studio layouts, and server order."
                  >
                    <button
                      type="button"
                      onClick={handleResetAllPreferences}
                      style={{
                        background: "rgba(244, 63, 94, 0.12)",
                        border: "1px solid rgba(244, 63, 94, 0.3)",
                        color: "#f87171",
                        padding: "8px 18px",
                        borderRadius: "100px",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(244, 63, 94, 0.25)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(244, 63, 94, 0.12)")}
                    >
                      <RotateCcw size={14} /> Reset Preferences
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

      {/* Sign-In Modal */}
      {showSignInModal && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md [background:var(--bg-elevated)] border [border-color:var(--border-subtle)] rounded-3xl p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setShowSignInModal(false)}
                className="absolute right-5 top-5 p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Sign In to Streamly</h3>
                  <p className="text-xs text-white/50">Sync preferences and watchlist to MongoDB Cloud.</p>
                </div>
              </div>

              {/* Google OAuth Button */}
              <div className="mb-4">
                <GoogleSignInButton
                  onSuccess={() => setShowSignInModal(false)}
                  shape="pill"
                  text="Sign in with Google"
                />
              </div>

              <div className="relative flex items-center justify-center my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <span className="relative px-3 [background:var(--bg-elevated,#181622)] text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                  or guest account
                </span>
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
                    className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-semibold transition-colors border-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl [background:var(--accent-gradient)] [color:var(--on-accent,#fff)] hover:brightness-110 text-sm font-bold transition-colors shadow-lg border-none"
                  >
                    Sign In
                  </button>
                </div>
              </form>
            </motion.div>
          </div>,
          document.body
        )}

      {/* Player UI Studio Modal */}
      {showControlsModal && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              role="dialog"
              aria-modal="true"
              aria-label="Player UI studio"
              className="w-full max-w-3xl [background:var(--bg-elevated)] border [border-color:var(--border-subtle)] rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              {/* Sticky close: the modal scrolls — a plain absolute button
                  scrolls under the fixed navbar and becomes unclickable. */}
              <div className="studio-modal-close">
                <button
                  onClick={() => setShowControlsModal(false)}
                  aria-label="Close player studio"
                  className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/15 bg-black/50 border border-white/10 backdrop-blur-sm"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

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
                className="w-full py-2.5 rounded-xl bg-white text-black hover:bg-gray-200 text-sm font-bold transition-colors mt-4 border-none"
              >
                Done
              </button>
            </motion.div>
          </div>,
          document.body
        )}
    </div>
  );
}
