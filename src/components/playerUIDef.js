import {
  Play,
  RotateCcw,
  Volume2,
  Captions,
  AudioLines,
  Expand,
  Gauge,
  Lock,
  Maximize,
  Sun,
  PictureInPicture2,
  RefreshCw,
  BookMarked,
  SkipForward,
  Cast,
} from "lucide-react";

/* ── Player UI Studio shared definitions ─────────────────────────────
   The video player control bar is divided into overlay zones. Every
   placeable control lives in exactly one zone (or the "tray", which
   hides it from the bar — it stays reachable through the menus).
   Presets assign all 9 controls; the player merges the stored layout
   over these defaults so corrupt/partial storage can never break it. */

export const PLAYER_ZONES = [
  { id: "topLeft", label: "Top left", blurb: "Floating cluster over the video" },
  { id: "topRight", label: "Top right", blurb: "Floating cluster over the video" },
  { id: "bottomLeft", label: "Bottom left", blurb: "Left side of the control bar" },
  { id: "bottomCenter", label: "Bottom center", blurb: "Middle of the control bar" },
  { id: "bottomRight", label: "Bottom right", blurb: "Right side of the control bar" },
  { id: "tray", label: "Hidden", blurb: "Menus only — off the bar" },
];

export const PLAYER_CONTROLS = [
  { key: "playPause", label: "Play / Pause", Icon: Play },
  { key: "jumpForwardBackward", label: "Skip ±10s", Icon: RotateCcw },
  { key: "volume", label: "Volume", Icon: Volume2 },
  { key: "subtitles", label: "Subtitles", Icon: Captions },
  { key: "audio", label: "Audio tracks", Icon: AudioLines },
  { key: "aspectRatio", label: "Aspect ratio", Icon: Expand },
  { key: "playbackSpeed", label: "Speed", Icon: Gauge },
  { key: "screenLock", label: "Screen lock", Icon: Lock },
  { key: "fullscreen", label: "Fullscreen", Icon: Maximize },
  { key: "brightness", label: "Brightness", Icon: Sun },
  { key: "pip", label: "Picture-in-Picture", Icon: PictureInPicture2 },
  { key: "loop", label: "Loop", Icon: RefreshCw },
  { key: "chapters", label: "Chapters", Icon: BookMarked },
  { key: "nextEpisode", label: "Next Episode", Icon: SkipForward },
  { key: "cast", label: "Cast", Icon: Cast },
];

/* Canonical left-to-right order inside a zone. */
export const PLAYER_CONTROL_ORDER = [
  "playPause",
  "jumpForwardBackward",
  "volume",
  "playbackSpeed",
  "subtitles",
  "audio",
  "aspectRatio",
  "screenLock",
  "fullscreen",
  "brightness",
  "pip",
  "loop",
  "chapters",
  "nextEpisode",
  "cast",
];

export const PLAYER_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const ICON_VARIANTS = [
  { id: "outline", label: "Outline" },
  { id: "filled", label: "Filled" },
  { id: "neon", label: "Neon" },
  { id: "glass", label: "Glass" },
];

export const DEFAULT_ICON_VARIANTS = Object.fromEntries(
  ["playPause","jumpForwardBackward","volume","subtitles","audio","aspectRatio","playbackSpeed","screenLock","fullscreen","brightness","pip","loop","chapters","nextEpisode","cast"].map((k) => [k, "outline"])
);

/* ── Player UI Skins ──────────────────────────────────────────────
   Each preset is a complete end-to-end look, not just an icon
   arrangement. Every token is emitted as a --skin-* CSS variable on
   the player root (and on the Studio preview), so both the real player
   and the live preview render the same visual identity.

   Token contract:
   - barBg / barBlur / barBorder / barRadius  → control-bar surface
   - btnBg / btnGhostBg / btnBorder / btnRadius / btnTone → buttons
     (btnBg = filled primary circle, btnGhostBg = secondary ghost buttons)
   - progressHeight / progressFill / progressGlow → scrubber
   - timeFont / accent                        → time row + accent color
   - panelBg / panelBlur / panelBorder        → settings panel + menus
   - scrim / chromeShadow                     → video scrims + chrome glow */
export const PLAYER_UI_SKINS = {
  classic: {
    id: "classic",
    name: "Classic",
    barBg: "transparent",
    barBlur: "0px",
    barBorder: "none",
    barRadius: "0px",
    btnBg: "rgba(255, 255, 255, 0.12)",
    btnGhostBg: "transparent",
    btnBorder: "none",
    btnRadius: "50%",
    btnTone: "frosted",
    progressHeight: "4px",
    progressFill: "var(--accent-gradient, linear-gradient(90deg, #f43f5e, #f59e0b))",
    progressGlow: "none",
    timeFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
    accent: "var(--accent-primary, #f43f5e)",
    panelBg: "rgba(18, 18, 20, 0.92)",
    panelBlur: "40px",
    panelBorder: "1px solid rgba(255, 255, 255, 0.08)",
    scrim: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 28%)",
    chromeShadow: "none",
    /* Full-UI tokens — Classic keeps today's shipped look exactly. */
    hudBg: "linear-gradient(180deg, rgba(22,22,26,0.9), rgba(10,10,12,0.9))",
    hudBlur: "24px",
    hudBorder: "1px solid rgba(255,255,255,0.12)",
    hudRadius: "18px",
    hudShadow: "0 14px 40px rgba(0,0,0,0.6)",
    hudFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
    toastBg: "rgba(28,28,30,0.78)",
    badgeBg: "rgba(28,28,30,0.7)",
    centerIconBg: "rgba(0,0,0,0.35)",
    centerIconBlur: "24px",
    centerIconBorder: "1px solid rgba(255,255,255,0.08)",
    centerIconTone: "ghost",
    progressTrack: "rgba(255,255,255,0.12)",
    progressBuffered: "rgba(255,255,255,0.14)",
    barInset: "0px",
    entrance: "fade",
    motionMs: 250,
    fontBody: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
    vignette: "none",
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    barBg: "rgba(0, 0, 0, 0)",
    barBlur: "0px",
    barBorder: "none",
    barRadius: "0px",
    btnBg: "transparent",
    btnGhostBg: "transparent",
    btnBorder: "none",
    btnRadius: "50%",
    btnTone: "ghost",
    progressHeight: "2px",
    progressFill: "rgba(255, 255, 255, 0.85)",
    progressGlow: "none",
    timeFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
    accent: "rgba(255, 255, 255, 0.9)",
    panelBg: "rgba(10, 10, 12, 0.9)",
    panelBlur: "24px",
    panelBorder: "1px solid rgba(255, 255, 255, 0.06)",
    scrim: "linear-gradient(to top, rgba(0,0,0,0.55), transparent 25%, transparent 80%, rgba(0,0,0,0.25))",
    chromeShadow: "none",
    /* Full-UI tokens — hairline, near-invisible, instant. */
    hudBg: "rgba(10,10,10,0.55)",
    hudBlur: "8px",
    hudBorder: "none",
    hudRadius: "10px",
    hudShadow: "none",
    hudFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
    toastBg: "rgba(10,10,10,0.55)",
    badgeBg: "rgba(10,10,10,0.6)",
    centerIconBg: "rgba(0,0,0,0.2)",
    centerIconBlur: "6px",
    centerIconBorder: "none",
    centerIconTone: "ghost",
    progressTrack: "rgba(255,255,255,0.15)",
    progressBuffered: "rgba(255,255,255,0.18)",
    barInset: "0px",
    entrance: "fade",
    motionMs: 160,
    fontBody: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
    vignette: "none",
  },
  compact: {
    id: "compact",
    name: "Compact",
    barBg: "rgba(16, 16, 22, 0.9)",
    barBlur: "28px",
    barBorder: "1px solid rgba(255, 255, 255, 0.12)",
    barRadius: "24px",
    btnBg: "rgba(255, 255, 255, 0.08)",
    btnGhostBg: "rgba(255, 255, 255, 0.08)",
    btnBorder: "1px solid rgba(255, 255, 255, 0.16)",
    btnRadius: "14px",
    btnTone: "squircle",
    progressHeight: "8px",
    progressFill: "linear-gradient(90deg, #ffffff, rgba(255,255,255,0.75))",
    progressGlow: "none",
    timeFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
    accent: "#ffffff",
    panelBg: "rgba(16, 16, 22, 0.95)",
    panelBlur: "32px",
    panelBorder: "1px solid rgba(255, 255, 255, 0.14)",
    scrim: "linear-gradient(to top, rgba(0,0,0,0.8), transparent 35%, transparent 75%, rgba(0,0,0,0.35))",
    chromeShadow: "0 8px 32px rgba(0, 0, 0, 0.55)",
    /* Full-UI tokens — chunky app-like surfaces, springy motion. */
    hudBg: "rgba(16,16,22,0.94)",
    hudBlur: "28px",
    hudBorder: "1px solid rgba(255,255,255,0.14)",
    hudRadius: "16px",
    hudShadow: "0 8px 32px rgba(0,0,0,0.55)",
    hudFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
    toastBg: "rgba(16,16,22,0.94)",
    badgeBg: "rgba(16,16,22,0.9)",
    centerIconBg: "rgba(255,255,255,0.1)",
    centerIconBlur: "28px",
    centerIconBorder: "1px solid rgba(255,255,255,0.18)",
    centerIconTone: "solid",
    progressTrack: "rgba(255,255,255,0.12)",
    progressBuffered: "rgba(255,255,255,0.16)",
    barInset: "14px",
    entrance: "pop",
    motionMs: 300,
    fontBody: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
    vignette: "none",
  },
  theater: {
    id: "theater",
    name: "Theater",
    barBg: "linear-gradient(to top, rgba(24, 14, 4, 0.92), rgba(24, 14, 4, 0.55))",
    barBlur: "10px",
    barBorder: "none",
    barRadius: "0px",
    btnBg: "rgba(255, 190, 80, 0.14)",
    btnGhostBg: "rgba(255, 190, 80, 0.14)",
    btnBorder: "1px solid rgba(255, 200, 100, 0.28)",
    btnRadius: "50%",
    btnTone: "gilded",
    progressHeight: "5px",
    progressFill: "linear-gradient(90deg, #ffd166, #ff9e2c)",
    progressGlow: "0 0 12px rgba(255, 178, 64, 0.55)",
    timeFont: "Georgia, 'Times New Roman', serif",
    accent: "#ffce6b",
    panelBg: "rgba(26, 16, 6, 0.94)",
    panelBlur: "24px",
    panelBorder: "1px solid rgba(255, 200, 100, 0.22)",
    scrim: "linear-gradient(to top, rgba(20,10,2,0.9), transparent 40%, transparent 60%, rgba(20,10,2,0.55))",
    chromeShadow: "0 4px 24px rgba(255, 178, 64, 0.18)",
    /* Full-UI tokens — amber-lit opera-box chrome, slow cinematic rise. */
    hudBg: "linear-gradient(180deg, rgba(26,16,6,0.94), rgba(14,8,2,0.94))",
    hudBlur: "18px",
    hudBorder: "1px solid rgba(255,200,100,0.25)",
    hudRadius: "22px",
    hudShadow: "0 18px 48px rgba(20,10,2,0.7)",
    hudFont: "Georgia, 'Times New Roman', serif",
    toastBg: "rgba(26,16,6,0.92)",
    badgeBg: "rgba(26,16,6,0.9)",
    centerIconBg: "rgba(26,16,6,0.5)",
    centerIconBlur: "18px",
    centerIconBorder: "1px solid rgba(255,200,100,0.3)",
    centerIconTone: "gilded",
    progressTrack: "rgba(255,209,102,0.15)",
    progressBuffered: "rgba(255,209,102,0.18)",
    barInset: "0px",
    entrance: "rise",
    motionMs: 420,
    fontBody: "Georgia, 'Times New Roman', serif",
    vignette: "radial-gradient(ellipse at center, transparent 58%, rgba(10,5,0,0.5) 100%)",
  },
  studio: {
    id: "studio",
    name: "Studio",
    barBg: "rgba(10, 10, 12, 0.97)",
    barBlur: "0px",
    barBorder: "1px solid rgba(255, 255, 255, 0.1)",
    barRadius: "0px",
    btnBg: "rgba(255, 255, 255, 0.05)",
    btnGhostBg: "rgba(255, 255, 255, 0.05)",
    btnBorder: "1px solid rgba(255, 255, 255, 0.14)",
    btnRadius: "8px",
    btnTone: "flat",
    progressHeight: "4px",
    progressFill: "linear-gradient(90deg, #ff3b4e, #ff6a5e)",
    progressGlow: "none",
    timeFont: "'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace",
    accent: "#ff3b4e",
    panelBg: "rgba(12, 12, 14, 0.98)",
    panelBlur: "0px",
    panelBorder: "1px solid rgba(255, 255, 255, 0.12)",
    scrim: "linear-gradient(to top, rgba(0,0,0,0.82), transparent 30%, transparent 70%, rgba(0,0,0,0.5))",
    chromeShadow: "none",
    /* Full-UI tokens — squared NLE panels, mono labels, snap timing. */
    hudBg: "rgba(10,10,12,0.97)",
    hudBlur: "0px",
    hudBorder: "1px solid rgba(255,255,255,0.12)",
    hudRadius: "4px",
    hudShadow: "0 4px 16px rgba(0,0,0,0.5)",
    hudFont: "'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace",
    toastBg: "rgba(10,10,12,0.97)",
    badgeBg: "rgba(10,10,12,0.95)",
    centerIconBg: "rgba(255,59,78,0.12)",
    centerIconBlur: "0px",
    centerIconBorder: "1px solid rgba(255,59,78,0.35)",
    centerIconTone: "flat-red",
    progressTrack: "rgba(255,255,255,0.1)",
    progressBuffered: "rgba(255,255,255,0.13)",
    barInset: "0px",
    entrance: "slide",
    motionMs: 120,
    fontBody: "'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace",
    vignette: "none",
  },
};

export const DEFAULT_SKIN_ID = "classic";

/* Resolve the skin tokens for a preset id. "custom" arrangements and
   unknown ids fall back to the Classic tokens — the classic look is the
   neutral surface every custom layout starts from. */
export function resolveSkin(presetId) {
  if (typeof presetId === "string" && PLAYER_UI_SKINS[presetId]) {
    return PLAYER_UI_SKINS[presetId];
  }
  return PLAYER_UI_SKINS[DEFAULT_SKIN_ID];
}

export const PLAYER_UI_PRESETS = [
  {
    id: "classic",
    name: "Classic",
    blurb: "Traditional web player — full-width frosted bar & edge-to-edge scrub rail",
    tagline: "Streaming Standard",
    archetype: "classic",
    features: ["Full-width frosted glass bar", "Edge-to-edge scrub rail", "Classic left/center/right clusters"],
    skinId: "classic",
    visibility: {
      playPause: true,
      jumpForwardBackward: true,
      volume: true,
      subtitles: true,
      audio: true,
      aspectRatio: true,
      playbackSpeed: true,
      screenLock: true,
      fullscreen: true,
      brightness: false,
      pip: false,
      loop: false,
      chapters: false,
      nextEpisode: false,
      cast: false,
    },
    layout: {
      playPause: "bottomLeft",
      jumpForwardBackward: "bottomLeft",
      volume: "bottomLeft",
      subtitles: "bottomRight",
      audio: "bottomRight",
      aspectRatio: "bottomRight",
      playbackSpeed: "tray",
      screenLock: "topLeft",
      fullscreen: "bottomRight",
      brightness: "tray",
      pip: "tray",
      loop: "tray",
      chapters: "tray",
      nextEpisode: "tray",
      cast: "tray",
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    blurb: "Apple TV style — floating bottom island with embedded scrubber & center trio",
    tagline: "Zen Floating Island",
    archetype: "minimal",
    features: ["Floating dynamic island capsule", "Embedded hairline progress bar", "Center circular playback trio"],
    skinId: "minimal",
    visibility: {
      playPause: true,
      jumpForwardBackward: false,
      volume: true,
      subtitles: false,
      audio: false,
      aspectRatio: false,
      playbackSpeed: false,
      screenLock: true,
      fullscreen: true,
      brightness: false,
      pip: false,
      loop: false,
      chapters: false,
      nextEpisode: false,
      cast: false,
    },
    layout: {
      playPause: "bottomLeft",
      jumpForwardBackward: "tray",
      volume: "bottomLeft",
      subtitles: "tray",
      audio: "tray",
      aspectRatio: "tray",
      playbackSpeed: "tray",
      screenLock: "topLeft",
      fullscreen: "bottomRight",
      brightness: "tray",
      pip: "tray",
      loop: "tray",
      chapters: "tray",
      nextEpisode: "tray",
      cast: "tray",
    },
  },
  {
    id: "compact",
    name: "Compact",
    blurb: "Mobile & social streaming — floating bottom dock with vertical right action rail",
    tagline: "Mobile Dock & Action Rail",
    archetype: "compact",
    features: ["Floating elevated capsule dock", "Vertical right-side action rail", "Chunky squircle buttons"],
    skinId: "compact",
    visibility: {
      playPause: true,
      jumpForwardBackward: true,
      volume: true,
      subtitles: true,
      audio: true,
      aspectRatio: true,
      playbackSpeed: true,
      screenLock: true,
      fullscreen: true,
      brightness: false,
      pip: false,
      loop: false,
      chapters: false,
      nextEpisode: false,
      cast: false,
    },
    layout: {
      playPause: "bottomLeft",
      jumpForwardBackward: "bottomLeft",
      volume: "bottomLeft",
      subtitles: "bottomLeft",
      audio: "bottomLeft",
      aspectRatio: "bottomLeft",
      playbackSpeed: "bottomLeft",
      screenLock: "topLeft",
      fullscreen: "bottomLeft",
      brightness: "tray",
      pip: "tray",
      loop: "tray",
      chapters: "tray",
      nextEpisode: "tray",
      cast: "tray",
    },
  },
  {
    id: "theater",
    name: "Theater",
    blurb: "IMAX cinema room — top metadata marquee, grand center stage & gold timeline",
    tagline: "Cinema Marquee & Stage",
    archetype: "theater",
    features: ["Top cinematic marquee header", "Grand center-screen amber stage", "Glowing gold timeline with countdown"],
    skinId: "theater",
    visibility: {
      playPause: true,
      jumpForwardBackward: true,
      volume: true,
      subtitles: true,
      audio: true,
      aspectRatio: true,
      playbackSpeed: true,
      screenLock: true,
      fullscreen: true,
      brightness: false,
      pip: false,
      loop: false,
      chapters: false,
      nextEpisode: false,
      cast: false,
    },
    layout: {
      playPause: "bottomLeft",
      jumpForwardBackward: "bottomLeft",
      volume: "bottomRight",
      subtitles: "topRight",
      audio: "topRight",
      aspectRatio: "topRight",
      playbackSpeed: "topRight",
      screenLock: "topLeft",
      fullscreen: "topRight",
      brightness: "tray",
      pip: "tray",
      loop: "tray",
      chapters: "tray",
      nextEpisode: "tray",
      cast: "tray",
    },
  },
  {
    id: "studio",
    name: "Studio",
    blurb: "Broadcast NLE editor — live telemetry, SMPTE frame timecode, ruler & VU meters",
    tagline: "Broadcast Pro NLE",
    archetype: "studio",
    features: ["Live broadcast telemetry bar", "SMPTE frame timecode & ruler", "Frame jog, speed strip & VU meters"],
    skinId: "studio",
    visibility: {
      playPause: true,
      jumpForwardBackward: true,
      volume: true,
      subtitles: true,
      audio: true,
      aspectRatio: true,
      playbackSpeed: true,
      screenLock: true,
      fullscreen: true,
      brightness: false,
      pip: false,
      loop: false,
      chapters: false,
      nextEpisode: false,
      cast: false,
    },
    layout: {
      playPause: "bottomLeft",
      jumpForwardBackward: "bottomLeft",
      volume: "topRight",
      subtitles: "bottomRight",
      audio: "bottomRight",
      aspectRatio: "bottomRight",
      playbackSpeed: "bottomRight",
      screenLock: "topLeft",
      fullscreen: "bottomRight",
      brightness: "tray",
      pip: "tray",
      loop: "tray",
      chapters: "tray",
      nextEpisode: "tray",
      cast: "tray",
    },
  },
];

export const DEFAULT_UI_LAYOUT = PLAYER_UI_PRESETS[0].layout;
export const DEFAULT_UI_VISIBILITY = PLAYER_UI_PRESETS[0].visibility;

const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/* Merge a stored layout over the preset defaults; unknown zones and
   unknown keys fall back so storage can never break the player. */
export function resolveUILayout(stored) {
  const base = { ...DEFAULT_UI_LAYOUT };
  if (!isPlainObject(stored)) return base;
  const zoneIds = new Set(PLAYER_ZONES.map((z) => z.id));
  for (const { key } of PLAYER_CONTROLS) {
    if (typeof stored[key] === "string" && zoneIds.has(stored[key])) {
      base[key] = stored[key];
    }
  }
  return base;
}

export function zoneOf(layout, key) {
  const resolved = resolveUILayout(layout);
  return resolved[key] || "tray";
}

/* Controls visible in a zone, in canonical order, honoring the
   visibility toggles (default-on, same semantics as the player).
   The tray is not a visible zone — it always resolves empty. */
export function controlsInZone(layout, visibility, zoneId) {
  if (zoneId === "tray") return [];
  const resolved = resolveUILayout(layout);
  return PLAYER_CONTROL_ORDER.filter(
    (key) => resolved[key] === zoneId && visibility?.[key] !== false,
  );
}

export function presetById(id) {
  return PLAYER_UI_PRESETS.find((p) => p.id === id) || null;
}