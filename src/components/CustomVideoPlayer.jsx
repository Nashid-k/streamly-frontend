import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { VideoSourceAdapter } from "../api/videoSourceAdapter";

import { movieService } from "../api/movieService";
import {
  Play, Pause, Volume1, Volume2, VolumeX, Maximize, Minimize,
  Settings, AlertCircle, Check, RotateCcw, RotateCw,
  SkipForward, FastForward, Rewind,
  Keyboard, X, Upload, Captions, Film, Link, Repeat, AudioLines,
  Lock, Unlock, StepBack, StepForward,
  PictureInPicture2, Cast, Sun, BookMarked,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SubtitleEngine } from "../utils/subtitleEngine";
import { logDebug, logWarn } from "../utils/debugLogger";
import { usePreferences } from "../context/preferences";
import { resolveUILayout, resolveSkin, PLAYER_CONTROL_ORDER, PLAYER_SPEEDS } from "./playerUIDef";

const formatSMPTE = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds < 0) return "00:00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 24);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
};

const getNumericId = (s) => {
  if (!s) return null;
  const m = s.toString().match(/\d+/);
  return m ? m[0] : null;
};

const ASPECT_RATIOS = [
  { id: "fit", name: "Fit (Original 16:9)", scale: 1 },
  { id: "fill", name: "Fill Screen (Edge-to-Edge)", scale: 1.25 },
  { id: "zoom", name: "Zoom 1.25x (Punch-Hole Cutout)", scale: 1.25 },
  { id: "cinema", name: "Cinema 2.39:1", scale: 1.344 },
  { id: "crop1610", name: "16:10", scale: 1.111 },
  { id: "stretch", name: "Stretch to Screen", scale: 1 },
];

/* Frame glyph dimensions [w, h] per aspect index — drawn in the aspect HUD
   so the shape visibly morphs as the user cycles through ratios. */
const AR_GLYPH = [
  [44, 25], // Fit (16:9)
  [52, 23], // Fill Screen (Edge-to-Edge)
  [48, 25], // Zoom 1.25x (Punch-Hole Cutout)
  [50, 21], // Cinema 2.39:1
  [42, 25], // 16:10
  [46, 25], // Stretch to Screen
];

const KEYBOARD_SHORTCUTS = [
  { key: "Space / K", action: "Play / Pause" },
  { key: "F", action: "Fullscreen" },
  { key: "M", action: "Mute" },
  { key: "→ / L", action: "Forward 10s" },
  { key: "← / J", action: "Rewind 10s" },
  { key: "↑↓", action: "Volume" },
  { key: "A", action: "Aspect Ratio" },
  { key: "?", action: "Shortcuts" },
];

const TOUCH_GESTURES = [
  { gesture: "Single Tap", action: "Show / Hide Controls" },
  { gesture: "Double Tap Left / Right", action: "Rewind / Forward 10s" },
  { gesture: "Swipe Left (Up / Down)", action: "Adjust Brightness" },
  { gesture: "Swipe Right (Up / Down)", action: "Adjust Volume" },
  { gesture: "Horizontal Swipe", action: "Seek Timeline" },
  { gesture: "Aspect Button", action: "Change Aspect Ratio" },
];

const LOADING_TIPS_DESKTOP = [
  { text: "Double-tap center for fullscreen", icon: Keyboard },
  { text: "Arrow keys to seek 10 seconds", icon: Keyboard },
  { text: "Scroll to adjust volume", icon: Keyboard },
  { text: "Press ? for all shortcuts", icon: Keyboard },
  { text: "Right-click for more options", icon: Settings },
];
const LOADING_TIPS_TOUCH = [
  { text: "Double-tap sides to seek 10s", icon: Keyboard },
  { text: "Swipe right side for volume", icon: Volume2 },
  { text: "Swipe left side for brightness", icon: Volume2 },
  { text: "Pinch to enter fullscreen", icon: Maximize },
  { text: "Tap center to play / pause", icon: Play },
];

/* ═══ Apple Design Language ═══════════════════════════════════════
   Inspired by Apple TV+ player — circular arcs, frosted glass,
   SF Pro typography, spring-physics animations, minimal chrome.
   ════════════════════════════════════════════════════════════════ */

/* Spring presets (Apple-style physics) */
const SPRING = { type: "spring", stiffness: 400, damping: 30, mass: 0.8 };
const SPRING_FAST = { type: "spring", stiffness: 600, damping: 35 };
const SPRING_SNAPPY = { type: "spring", stiffness: 500, damping: 28 };

/* Responsive design tokens — scale with viewport, never break */
const R = {
  /* Sizes scale via vmin so they work on phones through ultrawide */
  btnSmall: 'clamp(24px, 4vw, 34px)',
  btnMedium: 'clamp(32px, 5vw, 42px)',
  btnPlay: 'clamp(36px, 6vw, 46px)',
  /* Arc HUD sizes */
  arcSmall: 32,
  arcVolume: 'clamp(36px, 6vw, 48px)',
  arcSeek: 'clamp(48px, 8vw, 68px)',
  arcLoading: 'clamp(44px, 8vw, 60px)',
  /* Panel widths */
  panelSettings: 'clamp(240px, 40vw, 300px)',
  panelSubtitles: 'clamp(220px, 38vw, 280px)',
  panelShortcuts: 'clamp(240px, 42vw, 300px)',
  /* Fonts */
  fontTiny: 'clamp(8px, 1.5vw, 10px)',
  fontSmall: 'clamp(10px, 1.8vw, 12px)',
  fontMedium: 'clamp(11px, 2vw, 14px)',
  fontLarge: 'clamp(13px, 2.5vw, 16px)',
  fontHero: 'clamp(1.1rem, 3.5vw, 2.2rem)',
  /* Padding */
  padTiny: 'clamp(4px, 1vw, 8px)',
  padSmall: 'clamp(6px, 1.2vw, 12px)',
  padMedium: 'clamp(8px, 1.5vw, 16px)',
  padLarge: 'clamp(12px, 2vw, 24px)',
  /* Border radius */
  radiusSmall: 'clamp(6px, 1.2vw, 10px)',
  radiusMedium: 'clamp(8px, 1.5vw, 14px)',
  radiusPill: 100,
  /* Container */
  controlRowPad: 'clamp(4px, 1vw, 14px)',
  progressBarPad: 'clamp(8px, 2vw, 20px)',
};

/* Circular Arc Component — the core Apple TV+ motif
   Used for: volume HUD, seek indicators, loading, up-next countdown */
const ArcRing = ({ progress = 0, size = 48, strokeWidth = 3, color = "#fff", bgColor = "rgba(255,255,255,0.08)", glowColor, children, className, responsive }) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(progress, 1)));
  return (
    <div style={{ position: "relative", width: responsive || size, height: responsive || size, flexShrink: 0 }} className={className}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={strokeWidth} style={{ stroke: bgColor }} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ stroke: color, transition: "stroke-dashoffset 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>
      {glowColor && (
        <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)", filter: `blur(4px)`, opacity: 0.5 }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="transparent" strokeWidth={strokeWidth} />
          <circle
            cx={size/2} cy={size/2} r={r} fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ stroke: glowColor, transition: "stroke-dashoffset 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
        </svg>
      )}
      {children && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          /* Counter-rotate so children stay upright despite SVG rotation */
          transform: "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── PRESET-SPECIFIC HUD COMPONENTS ─────────────────────────────────────── */
function PresetVolumeHUD({ skin, effVolume, isMuted, volume, hudScale, hudTop }) {
  const isZero = isMuted || volume === 0;
  const pct = isZero ? 0 : Math.round(effVolume * 100);
  const skinId = skin?.id || "classic";

  return (
    <motion.div
      key="volume-hud"
      initial={{ opacity: 0, y: -18, scale: 0.9, x: "-50%" }}
      animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
      exit={{ opacity: 0, y: -8, scale: 0.95, x: "-50%" }}
      transition={SPRING_SNAPPY}
      style={{
        position: "absolute", left: "50%",
        top: hudTop,
        zIndex: 65, pointerEvents: "none",
      }}
    >
      {skinId === "material" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(12 * hudScale),
            background: "var(--skin-hud-bg, rgba(43, 38, 48, 0.94))",
            backdropFilter: "blur(var(--skin-hud-blur, 20px))",
            WebkitBackdropFilter: "blur(var(--skin-hud-blur, 20px))",
            border: "var(--skin-hud-border, 1px solid rgba(255,255,255,0.12))",
            borderRadius: "var(--skin-hud-radius, 20px)",
            padding: `${Math.round(8 * hudScale)}px ${Math.round(16 * hudScale)}px`,
            boxShadow: "var(--skin-hud-shadow, 0 8px 32px rgba(0,0,0,0.5))",
            fontFamily: "var(--skin-hud-font, 'Roboto', sans-serif)",
          }}
        >
          <div style={{
            background: isZero ? "rgba(255,82,82,0.2)" : "rgba(208,188,255,0.22)",
            color: isZero ? "#ff5252" : "var(--skin-accent, #d0bcff)",
            borderRadius: 12, padding: 6, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isZero ? <VolumeX size={17 * hudScale} /> : effVolume <= 0.33 ? <Volume1 size={17 * hudScale} /> : <Volume2 size={17 * hudScale} />}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minWidth: 100 * hudScale }}>
              <span style={{ fontSize: 10 * hudScale, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>Volume</span>
              <span style={{ fontSize: 12 * hudScale, fontWeight: 700, color: isZero ? "#ff5252" : "var(--skin-accent, #d0bcff)" }}>{isZero ? "Muted" : `${pct}%`}</span>
            </div>
            <div style={{ width: 100 * hudScale, height: 6, background: "rgba(255,255,255,0.14)", borderRadius: 3, overflow: "hidden" }}>
              <motion.div
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
                style={{ height: "100%", background: isZero ? "#ff5252" : "var(--skin-accent, #d0bcff)", borderRadius: 3 }}
              />
            </div>
          </div>
        </motion.div>
      ) : skinId === "theater" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(14 * hudScale),
            background: "linear-gradient(180deg, rgba(32,18,6,0.96), rgba(16,8,2,0.96))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1.5px solid rgba(255,200,100,0.35)",
            borderRadius: "var(--skin-hud-radius, 22px)",
            padding: `${Math.round(8 * hudScale)}px ${Math.round(18 * hudScale)}px`,
            boxShadow: "0 0 28px rgba(255,178,64,0.35), inset 0 0 14px rgba(255,178,64,0.08)",
            fontFamily: "var(--skin-hud-font, Georgia, serif)",
          }}
        >
          <span style={{ color: "#ffd166", fontSize: 14 * hudScale, filter: "drop-shadow(0 0 6px rgba(255,209,102,0.8))" }}>★</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isZero ? <VolumeX size={17 * hudScale} color="#ff5252" /> : <Volume2 size={17 * hudScale} color="#ffd166" />}
            <span style={{ fontSize: 13 * hudScale, fontWeight: 700, color: isZero ? "#ff5252" : "#ffd166", letterSpacing: "0.04em" }}>
              {isZero ? "MUTED" : `${pct}%`}
            </span>
          </div>
          <div style={{ width: 80 * hudScale, height: 5, background: "rgba(255,209,102,0.18)", borderRadius: 3, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              style={{ height: "100%", background: isZero ? "#ff5252" : "linear-gradient(90deg, #ffd166, #ff9e2c)", borderRadius: 3 }}
            />
          </div>
          <span style={{ fontSize: 9 * hudScale, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,209,102,0.7)" }}>SOUNDSTAGE</span>
        </motion.div>
      ) : skinId === "studio" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(12 * hudScale),
            background: "rgba(10,10,12,0.98)",
            border: "1px solid rgba(255,59,78,0.45)",
            borderRadius: 4,
            padding: `${Math.round(6 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            boxShadow: "0 4px 20px rgba(0,0,0,0.85), inset 0 0 10px rgba(255,59,78,0.1)",
            fontFamily: "var(--skin-hud-font, 'SF Mono', monospace)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#ff3b4e", fontSize: 10 * hudScale, fontWeight: 800 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ff3b4e" }} />
            CH-1
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {[1,2,3,4,5,6,7,8,9,10].map(step => {
              const active = !isZero && (pct / 10) >= step;
              const isPeak = step >= 9;
              const isHigh = step >= 7;
              return (
                <div
                  key={step}
                  style={{
                    width: 5 * hudScale,
                    height: 12 * hudScale,
                    borderRadius: 1,
                    background: active
                      ? (isPeak ? "#ff3b4e" : isHigh ? "#ffd600" : "#00e676")
                      : "rgba(255,255,255,0.08)",
                  }}
                />
              );
            })}
          </div>
          <span style={{ fontSize: 11 * hudScale, fontWeight: 700, color: isZero ? "#ff3b4e" : "#00e676", fontVariantNumeric: "tabular-nums" }}>
            {isZero ? "MUTE" : `${pct}%`}
          </span>
          <span style={{ fontSize: 9 * hudScale, color: "rgba(255,255,255,0.4)" }}>
            {isZero ? "-INF" : `${(effVolume * 12 - 12).toFixed(0)}dB`}
          </span>
        </motion.div>
      ) : skinId === "minimal" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(10 * hudScale),
            background: "rgba(12,12,16,0.75)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 999,
            padding: `${Math.round(6 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            fontFamily: "var(--skin-hud-font, sans-serif)",
          }}
        >
          {isZero ? <VolumeX size={14 * hudScale} color="#ff5252" /> : <Volume2 size={14 * hudScale} color="#fff" />}
          <div style={{ width: 70 * hudScale, height: 2.5, background: "rgba(255,255,255,0.15)", borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              style={{ height: "100%", background: isZero ? "#ff5252" : "#fff", borderRadius: 2 }}
            />
          </div>
          <span style={{ fontSize: 11 * hudScale, fontWeight: 600, color: isZero ? "#ff5252" : "#fff" }}>
            {isZero ? "0%" : `${pct}%`}
          </span>
        </motion.div>
      ) : skinId === "apple" ? (
        <motion.div
          layout
          style={{
            display: "flex", flexDirection: "row", alignItems: "center", gap: Math.round(11 * hudScale),
            background: "var(--skin-hud-bg, rgba(30, 30, 36, 0.88))",
            backdropFilter: "blur(var(--skin-hud-blur, 36px)) saturate(160%)",
            WebkitBackdropFilter: "blur(var(--skin-hud-blur, 36px)) saturate(160%)",
            border: isZero ? "1px solid rgba(255,69,58,0.35)" : "var(--skin-hud-border, 1px solid rgba(255,255,255,0.18))",
            borderRadius: "var(--skin-hud-radius, 24px)",
            padding: `${Math.round(8 * hudScale)}px ${Math.round(13 * hudScale)}px`,
            boxShadow: "var(--skin-hud-shadow, 0 14px 40px rgba(0,0,0,0.45))",
          }}
        >
          <ArcRing
            progress={effVolume}
            size={Math.round(40 * hudScale)}
            strokeWidth={3}
            color={isZero ? "#ff453a" : "#fff"}
            bgColor="rgba(255,255,255,0.1)"
            glowColor={isZero ? "#ff453a" : "#fff"}
          >
            <motion.span
              key={isZero ? "muted" : effVolume <= 0.33 ? "low" : "high"}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={SPRING_FAST}
              style={{ display: "flex", alignItems: "center" }}
            >
              {isZero ? (
                <VolumeX size={Math.round(17 * hudScale)} color="#ff453a" strokeWidth={2.2} />
              ) : effVolume <= 0.33 ? (
                <Volume1 size={Math.round(17 * hudScale)} color="rgba(255,255,255,0.92)" strokeWidth={2.2} />
              ) : (
                <Volume2 size={Math.round(17 * hudScale)} color="#fff" strokeWidth={2.2} />
              )}
            </motion.span>
          </ArcRing>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: Math.round(2 * hudScale), lineHeight: 1.1 }}>
            <span style={{
              color: isZero ? "#ff453a" : "rgba(255,255,255,0.95)",
              fontSize: Math.round(12 * hudScale) + 'px',
              fontWeight: 700,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              fontVariantNumeric: "tabular-nums",
            }}>
              {isZero ? "Muted" : `${pct}%`}
            </span>
            <span style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: Math.round(8 * hudScale) + 'px',
              fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
            }}>
              Volume
            </span>
          </div>
        </motion.div>
      ) : (
        /* Classic Streaming Standard */
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(12 * hudScale),
            background: "linear-gradient(180deg, rgba(22,22,26,0.92), rgba(10,10,12,0.92))",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 18,
            padding: `${Math.round(8 * hudScale)}px ${Math.round(16 * hudScale)}px`,
            boxShadow: "0 14px 40px rgba(0,0,0,0.6)",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
          }}
        >
          {isZero ? <VolumeX size={17 * hudScale} color="#ff453a" /> : <Volume2 size={17 * hudScale} color="#fff" />}
          <div style={{ width: 90 * hudScale, height: 4, background: "rgba(255,255,255,0.12)", borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              style={{ height: "100%", background: isZero ? "#ff453a" : "var(--accent-gradient, linear-gradient(90deg, #f43f5e, #f59e0b))", borderRadius: 2 }}
            />
          </div>
          <span style={{ fontSize: 12 * hudScale, fontWeight: 700, color: isZero ? "#ff453a" : "#fff" }}>
            {isZero ? "Muted" : `${pct}%`}
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}

function PresetBrightnessHUD({ skin, brightness, hudScale, hudTop }) {
  const pct = Math.round(brightness * 100);
  const skinId = skin?.id || "classic";

  return (
    <motion.div
      key="brightness-hud"
      initial={{ opacity: 0, y: -18, scale: 0.9, x: "-50%" }}
      animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
      exit={{ opacity: 0, y: -8, scale: 0.95, x: "-50%" }}
      transition={SPRING_SNAPPY}
      style={{
        position: "absolute", left: "50%",
        top: hudTop,
        zIndex: 65, pointerEvents: "none",
      }}
    >
      {skinId === "material" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(12 * hudScale),
            background: "var(--skin-hud-bg, rgba(43, 38, 48, 0.94))",
            backdropFilter: "blur(var(--skin-hud-blur, 20px))",
            WebkitBackdropFilter: "blur(var(--skin-hud-blur, 20px))",
            border: "var(--skin-hud-border, 1px solid rgba(255,255,255,0.12))",
            borderRadius: "var(--skin-hud-radius, 20px)",
            padding: `${Math.round(8 * hudScale)}px ${Math.round(16 * hudScale)}px`,
            boxShadow: "var(--skin-hud-shadow, 0 8px 32px rgba(0,0,0,0.5))",
            fontFamily: "var(--skin-hud-font, 'Roboto', sans-serif)",
          }}
        >
          <div style={{ background: "rgba(208,188,255,0.22)", color: "var(--skin-accent, #d0bcff)", borderRadius: 12, padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sun size={17 * hudScale} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minWidth: 100 * hudScale }}>
              <span style={{ fontSize: 10 * hudScale, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>Brightness</span>
              <span style={{ fontSize: 12 * hudScale, fontWeight: 700, color: "var(--skin-accent, #d0bcff)" }}>{pct}%</span>
            </div>
            <div style={{ width: 100 * hudScale, height: 6, background: "rgba(255,255,255,0.14)", borderRadius: 3, overflow: "hidden" }}>
              <motion.div
                animate={{ width: `${Math.min(100, Math.round((brightness / 1.5) * 100))}%` }}
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
                style={{ height: "100%", background: "var(--skin-accent, #d0bcff)", borderRadius: 3 }}
              />
            </div>
          </div>
        </motion.div>
      ) : skinId === "theater" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(14 * hudScale),
            background: "linear-gradient(180deg, rgba(32,18,6,0.96), rgba(16,8,2,0.96))",
            backdropFilter: "blur(20px)",
            border: "1.5px solid rgba(255,200,100,0.35)",
            borderRadius: "var(--skin-hud-radius, 22px)",
            padding: `${Math.round(8 * hudScale)}px ${Math.round(18 * hudScale)}px`,
            boxShadow: "0 0 28px rgba(255,178,64,0.35)",
            fontFamily: "var(--skin-hud-font, Georgia, serif)",
          }}
        >
          <span style={{ color: "#ffd166", fontSize: 14 * hudScale }}>★</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sun size={17 * hudScale} color="#ffd166" />
            <span style={{ fontSize: 13 * hudScale, fontWeight: 700, color: "#ffd166", letterSpacing: "0.04em" }}>
              {pct}%
            </span>
          </div>
          <div style={{ width: 80 * hudScale, height: 5, background: "rgba(255,209,102,0.18)", borderRadius: 3, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${Math.min(100, Math.round((brightness / 1.5) * 100))}%` }}
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              style={{ height: "100%", background: "linear-gradient(90deg, #ffd166, #ff9e2c)", borderRadius: 3 }}
            />
          </div>
          <span style={{ fontSize: 9 * hudScale, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,209,102,0.7)" }}>PROJECTION LUMA</span>
        </motion.div>
      ) : skinId === "studio" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(12 * hudScale),
            background: "rgba(10,10,12,0.98)",
            border: "1px solid rgba(255,59,78,0.45)",
            borderRadius: 4,
            padding: `${Math.round(6 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            boxShadow: "0 4px 20px rgba(0,0,0,0.85)",
            fontFamily: "var(--skin-hud-font, 'SF Mono', monospace)",
          }}
        >
          <span style={{ color: "#ff3b4e", fontSize: 10 * hudScale, fontWeight: 800 }}>LUMA</span>
          <div style={{ width: 80 * hudScale, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${Math.min(100, Math.round((brightness / 1.5) * 100))}%` }}
              style={{ height: "100%", background: "#00e5ff", borderRadius: 2 }}
            />
          </div>
          <span style={{ fontSize: 11 * hudScale, fontWeight: 700, color: "#00e5ff" }}>{pct}% IRE</span>
          <span style={{ fontSize: 9 * hudScale, color: "rgba(255,255,255,0.4)" }}>[CALIBRATED]</span>
        </motion.div>
      ) : skinId === "minimal" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(10 * hudScale),
            background: "rgba(12,12,16,0.75)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 999,
            padding: `${Math.round(6 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            fontFamily: "var(--skin-hud-font, sans-serif)",
          }}
        >
          <Sun size={14 * hudScale} color="#fff" />
          <div style={{ width: 70 * hudScale, height: 2.5, background: "rgba(255,255,255,0.15)", borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${Math.min(100, Math.round((brightness / 1.5) * 100))}%` }}
              style={{ height: "100%", background: "#fff", borderRadius: 2 }}
            />
          </div>
          <span style={{ fontSize: 11 * hudScale, fontWeight: 600, color: "#fff" }}>{pct}%</span>
        </motion.div>
      ) : (
        /* Apple / Classic */
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(12 * hudScale),
            background: "var(--skin-hud-bg, rgba(30, 30, 36, 0.88))",
            backdropFilter: "blur(var(--skin-hud-blur, 36px))",
            border: "var(--skin-hud-border, 1px solid rgba(255,255,255,0.18))",
            borderRadius: "var(--skin-hud-radius, 24px)",
            padding: `${Math.round(8 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            boxShadow: "var(--skin-hud-shadow, 0 14px 40px rgba(0,0,0,0.45))",
          }}
        >
          <ArcRing
            progress={Math.min(1, brightness / 1.5)}
            size={Math.round(40 * hudScale)}
            strokeWidth={3}
            color="#fbbf24"
            bgColor="rgba(255,255,255,0.1)"
            glowColor="#fbbf24"
          >
            <Sun size={Math.round(17 * hudScale)} color="#fbbf24" strokeWidth={2.2} />
          </ArcRing>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ color: "#fff", fontSize: Math.round(12 * hudScale) + 'px', fontWeight: 700 }}>
              {pct}%
            </span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: Math.round(8 * hudScale) + 'px', fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em" }}>
              Brightness
            </span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function PresetAspectRatioHUD({ skin, aspectRatioIndex, hudScale, hudTop, isTouch }) {
  const skinId = skin?.id || "classic";
  const currentAr = ASPECT_RATIOS[aspectRatioIndex] || ASPECT_RATIOS[0];

  return (
    <motion.div
      key="aspect-hud"
      initial={{ opacity: 0, y: -18, scale: 0.88, x: "-50%" }}
      animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
      exit={{ opacity: 0, y: -6, scale: 0.92, x: "-50%" }}
      transition={SPRING_SNAPPY}
      style={{
        position: "absolute", left: "50%",
        top: isTouch ? "calc(clamp(14px, 3vh, 28px) + var(--sat))" : hudTop,
        zIndex: 65, pointerEvents: "none",
      }}
    >
      {skinId === "material" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: isTouch ? 10 : Math.round(14 * hudScale),
            background: "var(--skin-hud-bg, rgba(43, 38, 48, 0.94))",
            backdropFilter: "blur(var(--skin-hud-blur, 20px))",
            WebkitBackdropFilter: "blur(var(--skin-hud-blur, 20px))",
            border: "var(--skin-hud-border, 1px solid rgba(255,255,255,0.12))",
            borderRadius: "var(--skin-hud-radius, 20px)",
            padding: isTouch ? "8px 16px" : `${Math.round(8 * hudScale)}px ${Math.round(18 * hudScale)}px`,
            boxShadow: "var(--skin-hud-shadow, 0 8px 32px rgba(0,0,0,0.5))",
            fontFamily: "var(--skin-hud-font, 'Roboto', sans-serif)",
          }}
        >
          <div style={{
            background: "var(--skin-accent, #d0bcff)",
            color: "#1e1b22",
            borderRadius: 14,
            padding: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Maximize size={16 * hudScale} strokeWidth={2.5} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 13 * hudScale, fontWeight: 700, color: "#fff" }}>
              {currentAr.name}
            </span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {ASPECT_RATIOS.map((ar, idx) => (
                <span
                  key={ar.name}
                  style={{
                    padding: "2px 6px",
                    borderRadius: 8,
                    fontSize: 9 * hudScale,
                    fontWeight: 700,
                    background: idx === aspectRatioIndex ? "var(--skin-accent, #d0bcff)" : "rgba(255,255,255,0.08)",
                    color: idx === aspectRatioIndex ? "#1e1b22" : "rgba(255,255,255,0.6)",
                  }}
                >
                  {ar.name}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      ) : skinId === "theater" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: isTouch ? 10 : Math.round(14 * hudScale),
            background: "linear-gradient(180deg, rgba(32,18,6,0.96), rgba(16,8,2,0.96))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1.5px solid rgba(255,200,100,0.45)",
            borderRadius: "var(--skin-hud-radius, 22px)",
            padding: isTouch ? "8px 18px" : `${Math.round(9 * hudScale)}px ${Math.round(20 * hudScale)}px`,
            boxShadow: "0 0 32px rgba(255,178,64,0.4), inset 0 0 12px rgba(255,178,64,0.1)",
            fontFamily: "var(--skin-hud-font, Georgia, serif)",
          }}
        >
          <span style={{ color: "#ffd166", fontSize: 15 * hudScale, filter: "drop-shadow(0 0 8px rgba(255,209,102,0.9))" }}>★</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13 * hudScale, fontWeight: 700, color: "#ffd166", letterSpacing: "0.06em" }}>
              CINEMA FRAME: {currentAr.name.toUpperCase()}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10 * hudScale, color: "rgba(255,209,102,0.8)", letterSpacing: "0.08em" }}>
                {aspectRatioIndex === 0 ? "1.78:1 FLAT" : aspectRatioIndex === 1 ? "16:9 EXPANDED" : aspectRatioIndex === 2 ? "4:3 ACADEMY" : "2.39:1 ANAMORPHIC"}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                {ASPECT_RATIOS.map((_, idx) => (
                  <span
                    key={idx}
                    style={{
                      width: idx === aspectRatioIndex ? 10 : 4,
                      height: 4,
                      borderRadius: 2,
                      background: idx === aspectRatioIndex ? "#ffd166" : "rgba(255,209,102,0.25)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      ) : skinId === "studio" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: isTouch ? 10 : Math.round(14 * hudScale),
            background: "rgba(10,10,12,0.98)",
            border: "1px solid rgba(255,59,78,0.5)",
            borderRadius: 4,
            padding: isTouch ? "7px 14px" : `${Math.round(7 * hudScale)}px ${Math.round(16 * hudScale)}px`,
            boxShadow: "0 4px 24px rgba(0,0,0,0.85), inset 0 0 12px rgba(255,59,78,0.12)",
            fontFamily: "var(--skin-hud-font, 'SF Mono', monospace)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: "#ff3b4e", color: "#fff", padding: "1px 5px", borderRadius: 2, fontSize: 9 * hudScale, fontWeight: 800 }}>
                RASTER
              </span>
              <span style={{ color: "#00e5ff", fontSize: 11 * hudScale, fontWeight: 700 }}>
                [{currentAr.name.toUpperCase()}] 1920x1080 SCAN
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 9 * hudScale }}>
                SCALE: {(currentAr.scale).toFixed(2)}x
              </span>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
              <span style={{ color: "#00e676", fontSize: 9 * hudScale }}>
                SMPTE GRID ON
              </span>
            </div>
          </div>
        </motion.div>
      ) : skinId === "minimal" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: isTouch ? 8 : Math.round(10 * hudScale),
            background: "rgba(12,12,16,0.75)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 999,
            padding: isTouch ? "6px 14px" : `${Math.round(6 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            fontFamily: "var(--skin-hud-font, sans-serif)",
          }}
        >
          <Maximize size={13 * hudScale} color="#fff" />
          <span style={{ fontSize: 12 * hudScale, fontWeight: 600, color: "#fff" }}>
            {currentAr.name}
          </span>
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {ASPECT_RATIOS.map((_, idx) => (
              <span
                key={idx}
                style={{
                  width: idx === aspectRatioIndex ? 6 : 3,
                  height: 3,
                  borderRadius: 2,
                  background: idx === aspectRatioIndex ? "#fff" : "rgba(255,255,255,0.2)",
                }}
              />
            ))}
          </div>
        </motion.div>
      ) : (
        /* Apple TV & Classic */
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.9 }}
          style={{
            display: "flex", alignItems: "center", gap: isTouch ? 10 : Math.round(12 * hudScale),
            background: "var(--skin-hud-bg, linear-gradient(180deg, rgba(22,22,26,0.92), rgba(10,10,12,0.92)))",
            backdropFilter: "blur(var(--skin-hud-blur, 24px)) saturate(160%)",
            WebkitBackdropFilter: "blur(var(--skin-hud-blur, 24px)) saturate(160%)",
            border: "var(--skin-hud-border, 1px solid rgba(255,255,255,0.12))",
            borderRadius: "var(--skin-hud-radius, 999px)",
            padding: isTouch ? "6px 14px" : `${Math.round(7 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            boxShadow:
              "var(--skin-hud-shadow, 0 16px 48px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.04), inset 0 0.5px 0 rgba(255,255,255,0.14))",
          }}
        >
          <motion.div
            animate={{ width: Math.round(44 * hudScale), height: Math.round(44 * hudScale) }}
            transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.9 }}
            style={{
              position: "relative", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 70%)",
              border: "1px solid rgba(255,255,255,0.07)",
            }} />
            <motion.div
              key={aspectRatioIndex}
              initial={{ scale: 0.7, opacity: 0.6 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: "absolute", width: Math.round(36 * hudScale), height: Math.round(36 * hudScale),
                borderRadius: "50%",
                border: "1.5px solid rgba(255,255,255,0.35)",
              }}
            />
            <motion.div
              initial={false}
              animate={{
                width: AR_GLYPH[aspectRatioIndex][0] * hudScale,
                height: AR_GLYPH[aspectRatioIndex][1] * hudScale,
              }}
              transition={{ type: "spring", stiffness: 430, damping: 24, mass: 0.9 }}
              style={{
                position: "relative", zIndex: 1, flexShrink: 0,
                borderRadius: 3, overflow: "hidden",
                border: "1.5px solid rgba(255,255,255,0.92)",
                background:
                  "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 100%)",
                boxShadow: "0 0 16px rgba(255,255,255,0.22), inset 0 0 12px rgba(255,255,255,0.06)",
              }}
            >
              <motion.div
                key={aspectRatioIndex}
                initial={{ x: "-85%", opacity: 0 }}
                animate={{ x: "85%", opacity: [0, 0.85, 0] }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{
                  position: "absolute", top: 0, bottom: 0, width: "55%",
                  background: "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
                }}
              />
            </motion.div>
            <motion.div
              key={aspectRatioIndex}
              initial={{ opacity: 0, scale: 1.25 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08, type: "spring", stiffness: 500, damping: 32 }}
              style={{ position: "absolute", inset: 0, zIndex: 2 }}
            >
              <div style={{ position: "absolute", top: -2, left: -2, width: 7, height: 7, borderTop: "2px solid rgba(255,255,255,0.85)", borderLeft: "2px solid rgba(255,255,255,0.85)", borderTopLeftRadius: 2 }} />
              <div style={{ position: "absolute", top: -2, right: -2, width: 7, height: 7, borderTop: "2px solid rgba(255,255,255,0.85)", borderRight: "2px solid rgba(255,255,255,0.85)", borderTopRightRadius: 2 }} />
              <div style={{ position: "absolute", bottom: -2, left: -2, width: 7, height: 7, borderBottom: "2px solid rgba(255,255,255,0.85)", borderLeft: "2px solid rgba(255,255,255,0.85)", borderBottomLeftRadius: 2 }} />
              <div style={{ position: "absolute", bottom: -2, right: -2, width: 7, height: 7, borderBottom: "2px solid rgba(255,255,255,0.85)", borderRight: "2px solid rgba(255,255,255,0.85)", borderBottomRightRadius: 2 }} />
            </motion.div>
          </motion.div>

          <div style={{ display: "flex", flexDirection: "column", gap: Math.round(5 * hudScale) }}>
            <motion.span
              key={`${aspectRatioIndex}-name`}
              initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={SPRING_SNAPPY}
              style={{
                color: "#fff", fontSize: Math.round(13 * hudScale) + 'px', fontWeight: 700, lineHeight: 1.2,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                whiteSpace: "nowrap",
              }}
            >
              {currentAr.name}
            </motion.span>
            <div style={{ display: "flex", alignItems: "center", gap: Math.round(6 * hudScale) }}>
              <motion.span
                key={`${aspectRatioIndex}-pct`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={SPRING_FAST}
                style={{
                  color: aspectRatioIndex === 0 ? "rgba(255,255,255,0.9)" : "#7DD3FC",
                  fontSize: Math.round(10 * hudScale) + 'px', fontWeight: 700,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {aspectRatioIndex === 0 ? "Original" : `+${Math.round((currentAr.scale - 1) * 100)}%`}
              </motion.span>
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                {ASPECT_RATIOS.map((_, i) => (
                  <motion.i
                    key={i}
                    animate={{
                      width: i === aspectRatioIndex ? 7 : 4,
                      height: 3.5,
                      backgroundColor: i === aspectRatioIndex
                        ? (aspectRatioIndex === 0 ? "rgba(255,255,255,0.95)" : "#7DD3FC")
                        : "rgba(255,255,255,0.18)",
                    }}
                    transition={{ type: "spring", stiffness: 600, damping: 32 }}
                    style={{ display: "block", borderRadius: 2 }}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

/* Apple TV+ style loading arc — clean spinning gradient trail */
const LoadingArc = ({ size = 56, strokeWidth = 2.5, progress = 0 }) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* Static track ring */}
      <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth}
        />
      </svg>
      {/* Spinning gradient arc — Apple TV+ style with fade trail */}
      <motion.svg
        width={size} height={size}
        style={{ position: "absolute", inset: 0 }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
      >
        <defs>
          <linearGradient id="loadArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.6)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.95)" />
          </linearGradient>
        </defs>
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke="url(#loadArcGrad)" strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circ * 0.25} ${circ * 0.75}`}
        />
      </motion.svg>
      {/* Inner progress ring — fills over time */}
      {progress > 0 && (
        <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id="loadInnerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.25)" />
            </linearGradient>
          </defs>
          <circle
            cx={size/2} cy={size/2} r={r - strokeWidth * 2}
            fill="none" stroke="url(#loadInnerGrad)" strokeWidth={strokeWidth * 0.5}
            strokeDasharray={2 * Math.PI * (r - strokeWidth * 2)}
            strokeDashoffset={2 * Math.PI * (r - strokeWidth * 2) * (1 - progress)}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)" }}
            transform={`rotate(-90 ${size/2} ${size/2})`}
          />
        </svg>
      )}
    </div>
  );
};

/* ═══ Main Player ═══════════════════════════════════════════════ */
/* Detect touch device: has touch screen + no hover = mobile/tablet */
const useIsTouch = () => {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const noHover = window.matchMedia('(hover: none)').matches;
    setIsTouch(hasTouch && noHover);
  }, []);
  return isTouch;
};

/* Observe the player container size → derive a live HUD scale factor so
   the top-center HUDs stay proportional from phones to 4K monitors. */
const useContainerSize = (ref) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
};

const CustomVideoPlayer = ({
  movie, season, episode, preferredServerIndex = 0, onServerChange,
  hasNextEpisode, onNextEpisode, onClose, thumbnailUrl, startTime = 0, onProgressUpdate,
  /* Ordered server list from TitleDetails (user's Settings → Server Order).
     Indices everywhere in this player refer to THIS list. Falls back to the
     static base order when the parent renders without it (tests, reuse). */
  servers: serversProp,
}) => {
  const {
    autoplay,
    setPreference,
    autoSkipIntro,
    seekTime = 10,
    subtitleSize = 100,
    subtitleColor = "#ffffff",
    subtitleFont = "cinejoy",
    subtitleBgBlur = true,
    autoSubtitles = true,
    defaultLanguage = "en",
    playerControls = {},
    playerUILayout,
    playerUIPreset = "classic",
    playerUISkin = "classic",
    playerGlobalIconStyle = "auto",
    playerIconVariants = {},
  } = usePreferences();
  // Per-button visibility flags — default to true when not explicitly set
  const ctrl = {
    playPause: playerControls.playPause !== false,
    jumpForwardBackward: playerControls.jumpForwardBackward !== false,
    volume: playerControls.volume !== false,
    aspectRatio: playerControls.aspectRatio !== false,
    subtitles: playerControls.subtitles !== false,
    audio: playerControls.audio !== false,
    playbackSpeed: playerControls.playbackSpeed !== false,
    screenLock: playerControls.screenLock !== false,
    fullscreen: playerControls.fullscreen !== false,
  };
  const seekStep = Number(seekTime) || 10;
  const seekStepRef = useRef(seekStep);
  useEffect(() => { seekStepRef.current = seekStep; }, [seekStep]);

  /* ── Player UI Studio layout ─────────────────────────────────────
     Zone placement for every control (topLeft/topRight/bottomLeft/
     bottomRight/tray). Corrupt/partial storage falls back to Classic.
     Visibility still honors the playerControls toggles (default-on). */
  const uiLayout = useMemo(() => resolveUILayout(playerUILayout), [playerUILayout]);
  /* ── Player UI skin (end-to-end look per preset) ────────────────
     Custom arrangements and unknown ids resolve to the Classic tokens.
     Emitted as --skin-* CSS variables on the player root below. */
  const skin = useMemo(
    () => resolveSkin(playerUIPreset === "custom" ? (playerUISkin || "classic") : playerUIPreset),
    [playerUIPreset, playerUISkin],
  );
  const skinVars = useMemo(
    () => ({
      "--skin-bar-bg": skin.barBg,
      "--skin-bar-blur": skin.barBlur,
      "--skin-bar-border": skin.barBorder,
      "--skin-bar-radius": skin.barRadius,
      "--skin-bar-inset": skin.barInset || "0px",
      "--skin-btn-bg": skin.btnBg,
      "--skin-btn-ghost-bg": skin.btnGhostBg || "transparent",
      "--skin-btn-border": skin.btnBorder,
      "--skin-btn-radius": skin.btnRadius,
      "--skin-progress-height": skin.progressHeight,
      "--skin-progress-fill": skin.progressFill,
      "--skin-progress-glow": skin.progressGlow,
      "--skin-progress-track": skin.progressTrack || "rgba(255,255,255,0.12)",
      "--skin-progress-buffered": skin.progressBuffered || "rgba(255,255,255,0.14)",
      "--skin-time-font": skin.timeFont,
      "--skin-accent": skin.accent,
      "--skin-panel-bg": skin.panelBg,
      "--skin-panel-blur": skin.panelBlur,
      "--skin-panel-border": skin.panelBorder,
      "--skin-scrim": skin.scrim,
      "--skin-chrome-shadow": skin.chromeShadow,
      /* Full-UI tokens — HUDs, toasts, badges, center burst, typography,
         entrance motion. Every floating surface reads these so a preset
         swap restyles the ENTIRE player, not just the control bar. */
      "--skin-hud-bg": skin.hudBg,
      "--skin-hud-blur": skin.hudBlur,
      "--skin-hud-border": skin.hudBorder,
      "--skin-hud-radius": skin.hudRadius,
      "--skin-hud-shadow": skin.hudShadow,
      "--skin-hud-font": skin.hudFont,
      "--skin-toast-bg": skin.toastBg || skin.hudBg,
      "--skin-badge-bg": skin.badgeBg || skin.hudBg,
      "--skin-center-icon-bg": skin.centerIconBg,
      "--skin-center-icon-blur": skin.centerIconBlur,
      "--skin-center-icon-border": skin.centerIconBorder,
      "--skin-font-body": skin.fontBody || skin.hudFont,
      "--skin-vignette": skin.vignette || "none",
    }),
    [skin],
  );
  /* Entrance-motion contract shared by every animated chrome surface:
     initial/animate/exit per skin. Theater rises, Compact pops, Studio
     slides, Minimal/Classic fade — timings come from skin.motionMs. */
  const entranceVariants = useMemo(() => {
    const ms = (skin.motionMs || 250) / 1000;
    const ease = [0.16, 1, 0.3, 1];
    switch (skin.entrance) {
      case "rise":
        return {
          bar: { initial: { opacity: 0, y: 34 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 26 }, transition: { duration: ms, ease } },
          hud: { initial: { opacity: 0, y: -26, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -14, scale: 0.97 }, transition: { duration: ms, ease } },
          center: { initial: { opacity: 0, scale: 0.7, y: 10 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 1.3, y: -6 }, transition: { duration: ms, ease } },
        };
      case "pop":
        return {
          bar: { initial: { opacity: 0, scale: 0.94, y: 14 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.96, y: 8 }, transition: { type: "spring", stiffness: 460, damping: 30 } },
          hud: { initial: { opacity: 0, scale: 0.82 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.9 }, transition: { type: "spring", stiffness: 480, damping: 26 } },
          center: { initial: { opacity: 0, scale: 0.4 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.6 }, transition: { type: "spring", stiffness: 500, damping: 24 } },
        };
      case "slide":
        return {
          bar: { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 22 }, transition: { duration: ms, ease: "easeOut" } },
          hud: { initial: { opacity: 0, x: -18 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -18 }, transition: { duration: ms, ease: "easeOut" } },
          center: { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.25 }, transition: { duration: ms, ease: "easeOut" } },
        };
      case "unfold":
        return {
          bar: { initial: { opacity: 0, scaleY: 0.4, y: 18 }, animate: { opacity: 1, scaleY: 1, y: 0 }, exit: { opacity: 0, scaleY: 0.5, y: 10 }, transition: { duration: ms, ease } },
          hud: { initial: { opacity: 0, scaleY: 0.3, y: -14 }, animate: { opacity: 1, scaleY: 1, y: 0 }, exit: { opacity: 0, scaleY: 0.4, y: -8 }, transition: { duration: ms, ease } },
          center: { initial: { opacity: 0, scale: 0.6, rotate: -6 }, animate: { opacity: 1, scale: 1, rotate: 0 }, exit: { opacity: 0, scale: 1.4, rotate: 4 }, transition: { duration: ms, ease } },
        };
      default: /* fade */
        return {
          bar: { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 }, transition: { duration: ms, ease } },
          hud: { initial: { opacity: 0, y: -18, scale: 0.9 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -8, scale: 0.95 }, transition: { duration: ms, ease } },
          center: { initial: { opacity: 0, scale: 0.5 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.5 }, transition: { duration: ms, ease } },
        };
    }
  }, [skin]);
  /* Touch detection must live above topZoneKeys — the skin-era callback
     below reads it in both its body and deps array (a later declaration
     here put it in the temporal dead zone and crashed every render). */
  const isTouch = useIsTouch();
  const zoneKeys = useCallback((zone) => (
    PLAYER_CONTROL_ORDER.filter((k) => uiLayout[k] === zone && playerControls[k] !== false)
  ), [uiLayout, playerControls]);
  /* The floating touch lock button already covers topLeft — don't double it. */
  const topZoneKeys = useCallback((zone) => (
    zoneKeys(zone).filter((k) => !(k === "screenLock" && zone === "topLeft" && isTouch))
  ), [zoneKeys, isTouch]);

  /* NOTE: cycleSpeed is defined after sendCommand/playbackRate below —
     defining it here put those bindings in the temporal dead zone and
     crashed the player on every render. */
  /* State */
  const [activeServerIndex, setActiveServerIndex] = useState(preferredServerIndex);
  const activeServerIndexRef = useRef(activeServerIndex);
  useEffect(() => { activeServerIndexRef.current = activeServerIndex; }, [activeServerIndex]);

  // The playable rotation — the user's ordered list when provided.
  const SERVERS = useMemo(
    () => (Array.isArray(serversProp) && serversProp.length > 0 ? serversProp : VideoSourceAdapter.getServers()),
    [serversProp],
  );
  const serverCount = SERVERS.length;

  const failoverToNextServer = useCallback((msg = "Stream unavailable — trying next server") => {
    setErrorMessage(msg);
    setTimeout(() => {
      setErrorMessage("");
      const ni = (activeServerIndexRef.current + 1) % serverCount;
      setActiveServerIndex(ni);
      onServerChange?.(ni);
    }, 2000);
  }, [onServerChange, serverCount]);

  const [iframeUrl, setIframeUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const volumeRef = useRef(1);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const [showVolumeArc, setShowVolumeArc] = useState(false);
  const [showAspectRatioArc, setShowAspectRatioArc] = useState(false);
  const autoPlayNext = autoplay;
  const [doubleTapRipple, setDoubleTapRipple] = useState(null);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [centerIcon, setCenterIcon] = useState(null);
  const [sideIcon, setSideIcon] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSubtitlesMenu, setShowSubtitlesMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [aspectRatioIndex, setAspectRatioIndex] = useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      const saved = localStorage.getItem("streamly_aspectRatio");
      if (saved !== null) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= 0 && n < ASPECT_RATIOS.length) return n;
      }
    } catch {}
    // Phones: pick a smart default that matches the orientation. Landscape
    // (punch-hole / notches) → "Fill Screen (Edge-to-Edge)" so no black bars.
    // Portrait → "Fit (Original)" so the 16:9 picture isn't over-cropped.
    const isTouchish = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const noHover = window.matchMedia?.("(hover: none)")?.matches;
    const isPhone = isTouchish && noHover && window.innerWidth < 900;
    if (isPhone) return window.innerWidth > window.innerHeight ? 1 : 0;
    return 0;
  });
  /* True once the user intentionally changes the aspect ratio — after that we
     stop auto-switching it on device rotation. */
  const aspectManuallySetRef = useRef(false);
  const [toastMessage, setToastMessage] = useState("");
  /* Restored (was deleted by 6ba4c76's dead-stream cleanup, leaving 3 live
     references → ReferenceError → "Oops! Something went wrong" on Play).
     false = CineSrc renders the custom zone-driven chrome; flipping this
     on falls back to the provider's native controls. */
  const [useNativeControls] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverX, setHoverX] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [skipIntroTime, setSkipIntroTime] = useState(null);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const [upNextCountdown, setUpNextCountdown] = useState(15);
  const [, setServerErrorCounts] = useState({});
  const [, setLastServer] = useState(() => localStorage.getItem("streamly_lastserver") || "");
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0 });
  const [isLooping, setIsLooping] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const brightnessRef = useRef(1);
  useEffect(() => { brightnessRef.current = brightness; }, [brightness]);
  const [showBrightnessArc, setShowBrightnessArc] = useState(false);
  const brightnessArcTimerRef = useRef(null);
  const [qualities, setQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState(null);
  const [audioTracks, setAudioTracks] = useState([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(null);
  const [showPausedInfo, setShowPausedInfo] = useState(false);
  const pausedInfoTimerRef = useRef(null);

  /* Touch gesture state — VLC/MX Player style */
  const [gestureType, setGestureType] = useState(null); // 'brightness' | 'volume' | 'seek'
  const [gestureValue, setGestureValue] = useState(0);
  const [seekDelta, setSeekDelta] = useState(0);
  const gestureStartRef = useRef(null);
  const gestureLockRef = useRef(null); // Lock direction after first significant move
  const gestureHudTimerRef = useRef(null);
  const pinchStartDistRef = useRef(null);
  const pinchStartFullscreenRef = useRef(false);
  const [orientation, setOrientation] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  );

  /* Track orientation with state so layout and aspect ratio update on device rotation */
  useEffect(() => {
    const check = () => {
      const next = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
      setOrientation(next);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    if (window.screen?.orientation?.addEventListener) {
      window.screen.orientation.addEventListener('change', check);
    }
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
      if (window.screen?.orientation?.removeEventListener) {
        window.screen.orientation.removeEventListener('change', check);
      }
    };
  }, []);

  /* Phones: follow the screen shape until the user picks a ratio manually.
     Rotate to landscape → edge-to-edge Fill (kills punch-hole black bars);
     rotate back to portrait → Fit so the 16:9 image isn't over-cropped. */
  useEffect(() => {
    if (aspectManuallySetRef.current) return;
    const isPhone = window.innerWidth < 900 &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
      (window.matchMedia?.('(hover: none)')?.matches ?? false);
    if (isPhone) {
      setAspectRatioIndex(window.innerWidth > window.innerHeight ? 1 : 0);
    }
  }, [orientation]);

  /* Refs */
  const iframeRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const clickTimeoutRef = useRef(null);
  const singleTapTimerRef = useRef(null);
  const progressBarRef = useRef(null);
  const progressTrackRef = useRef(null); // the actual bar (inside the padded hit area)
  const targetSeekTimeRef = useRef(null);
  const seekAccumulatorRef = useRef(0);
  const seekTimeoutRef = useRef(null);
  const centerIconTimeoutRef = useRef(null);
  const sideIconTimeoutRef = useRef(null);
  const hasTriggeredNextRef = useRef(false);
  const skipIntroTimeoutRef = useRef(null);
  const upNextIntervalRef = useRef(null);
  const upNextShownRef = useRef(false);
  const lastProgressWriteRef = useRef(0);
  const lastTouchEndRef = useRef(0);
  const centerIconKeyRef = useRef(0);
  const subtitleInputRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const volumeArcTimerRef = useRef(null);
  const aspectRatioArcTimerRef = useRef(null);
  const volumeBarRef = useRef(null);
  const isDraggingVolumeRef = useRef(false);
  const isLoopingRef = useRef(isLooping);
  useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);

  /* Persist the user's aspect-ratio choice so it survives reloads */
  useEffect(() => {
    try { localStorage.setItem("streamly_aspectRatio", String(aspectRatioIndex)); } catch {}
  }, [aspectRatioIndex]);

  const previewThumbTimerRef = useRef(null);
  const seekLongPressRef = useRef(null);

  const isCineSrc = iframeUrl.includes("cinesrc.st");
  const isVidCore = iframeUrl.includes("vidcore.io");
  const isPeachify = iframeUrl.includes("peachify.top");
  const isVidUp = iframeUrl.includes("vidup.to");
  // Quality / audio / playback-rate menus are only wired to CineSrc's command
  // API. VidCore/Peachify/VidUp use their own native controls UI.
  const hasManagedSettings = isCineSrc;
  const showCustomUI = isCineSrc && !useNativeControls;

  /* Auto-hide paused info */
  useEffect(() => {
    if (pausedInfoTimerRef.current) clearTimeout(pausedInfoTimerRef.current);
    if (!isPlaying && !isLoading && showCustomUI && hasInitiallyLoaded && duration > 0) {
      pausedInfoTimerRef.current = setTimeout(() => setShowPausedInfo(true), 1500);
    } else {
      setShowPausedInfo(false);
    }
    return () => { if (pausedInfoTimerRef.current) clearTimeout(pausedInfoTimerRef.current); };
  }, [isPlaying, isLoading, showCustomUI, hasInitiallyLoaded, duration]);

  const autoPlayNextRef = useRef(autoPlayNext);
  useEffect(() => { autoPlayNextRef.current = autoPlayNext; }, [autoPlayNext]);
  const isLoadingRef = useRef(isLoading);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const subtitleEngineRef = useRef(new SubtitleEngine());
  const [activeSubtitleCue, setActiveSubtitleCue] = useState(null);
  const [hasSubtitles, setHasSubtitles] = useState(false);
  const hasSubtitlesRef = useRef(false);
  useEffect(() => { hasSubtitlesRef.current = hasSubtitles; }, [hasSubtitles]);
  const [availableSubtitleLangs, setAvailableSubtitleLangs] = useState([]);
  const [isFetchingSubtitles, setIsFetchingSubtitles] = useState(false);
  const [subtitleEnabled, setSubtitleEnabled] = useState(false);
  const [subtitleFileName, setSubtitleFileName] = useState("");
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const subtitleOffsetRef = useRef(0);
  useEffect(() => { subtitleOffsetRef.current = subtitleOffset; }, [subtitleOffset]);

  const isTvContent = movie?.isSeries || String(movie?.id || "").startsWith("tmdb-tv-");

  useEffect(() => {
    hasTriggeredNextRef.current = false;
    upNextShownRef.current = false;
    setShowUpNext(false);
    setSkipIntroTime(null);
    setShowSkipIntro(false);
    setUpNextCountdown(15);
    setHasInitiallyLoaded(false);
    setSubtitleOffset(0);
  }, [movie?.id, season, episode]);

  // Reset next-episode trigger on mount (player opened) and on unmount (player closed)
  useEffect(() => {
    hasTriggeredNextRef.current = false;
    upNextShownRef.current = false;
  }, []);

  useEffect(() => { setActiveServerIndex(preferredServerIndex); }, [preferredServerIndex]);

  useEffect(() => {
    const sv = localStorage.getItem("streamly_volume");
    const sm = localStorage.getItem("streamly_muted");
    if (sv !== null) setVolume(parseFloat(sv));
    if (sm === "true") setIsMuted(true);
  }, []);

  useEffect(() => {
    const h = () => setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", h);
    document.addEventListener("webkitfullscreenchange", h);
    return () => {
      document.removeEventListener("fullscreenchange", h);
      document.removeEventListener("webkitfullscreenchange", h);
    };
  }, []);

  const contentSignatureRef = useRef("");
  const genKeyRef = useRef("");
  const [dynamicTips, setDynamicTips] = useState(LOADING_TIPS_DESKTOP);

  useEffect(() => {
    if (!isLoading && !hasInitiallyLoaded) setHasInitiallyLoaded(true);
  }, [isLoading, hasInitiallyLoaded]);

  /* Animate loading progress bar while waiting */
  useEffect(() => {
    if (!isLoading) { setLoadProgress(0); return; }
    setLoadProgress(0.05);
    const steps = [
      { t: 800, v: 0.25 },
      { t: 2000, v: 0.55 },
      { t: 5000, v: 0.75 },
      { t: 10000, v: 0.88 },
      { t: 18000, v: 0.95 },
    ];
    const timers = steps.map(({ t, v }) => setTimeout(() => setLoadProgress(v), t));
    return () => timers.forEach(clearTimeout);
  }, [isLoading]);

  useEffect(() => {
    if (movie?.id) {
      movieService.getSimilarMovies(movie.id, movie.platform || "tmdb").then((data) => {
        if (data?.length > 0) {
          const recs = data.slice(0, 3).map((m) => ({ text: m.title || m.name, icon: Film }));
          const baseTips = isTouch ? LOADING_TIPS_TOUCH : LOADING_TIPS_DESKTOP;
          const s = [...baseTips, ...recs];
          for (let i = s.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [s[i], s[j]] = [s[j], s[i]];
          }
          setDynamicTips(s);
        }
      }).catch((error) => {
        logWarn("player", "Loading-tips recommendations failed — default tips kept.", { id: movie?.id, message: error?.message });
      });
    }
  }, [movie, isTouch]);

  /* Switch tips when device type is known */
  useEffect(() => {
    const baseTips = isTouch ? LOADING_TIPS_TOUCH : LOADING_TIPS_DESKTOP;
    setDynamicTips((prev) => {
      /* Only update if we're still on the default tips (not enriched with recs) */
      const isDefault = prev.length <= 5 && prev.every(t => LOADING_TIPS_DESKTOP.includes(t) || LOADING_TIPS_TOUCH.includes(t));
      return isDefault ? baseTips : prev;
    });
  }, [isTouch]);

  useEffect(() => {
    if (!hasInitiallyLoaded) {
      const iv = setInterval(() => setCurrentTipIndex((p) => (p + 1) % dynamicTips.length), 4000);
      return () => clearInterval(iv);
    }
  }, [hasInitiallyLoaded, dynamicTips.length]);

  /* Block popup ads from CineSrc iframe — only override while player is active */
  useEffect(() => {
    if (!isCineSrc || !showCustomUI) return;
    const origOpen = window.open;
    // Only block popups that look like ads (no opener, from iframe context)
    window.open = (url, target, features) => {
      // Allow popups with explicit features (OAuth, share dialogs, etc.)
      if (features) return origOpen(url, target, features);
      // Block blank popups likely from ad scripts
      return null;
    };
    return () => { window.open = origOpen; };
  }, [isCineSrc, showCustomUI]);

  /* Cleanup ALL timers on unmount to prevent memory leaks */
  useEffect(() => {
    return () => {
      [controlsTimeoutRef, clickTimeoutRef, singleTapTimerRef, seekTimeoutRef,
       centerIconTimeoutRef, sideIconTimeoutRef, skipIntroTimeoutRef,
       toastTimeoutRef, volumeArcTimerRef, aspectRatioArcTimerRef, brightnessArcTimerRef,
       gestureHudTimerRef, previewThumbTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
      if (upNextIntervalRef.current) clearInterval(upNextIntervalRef.current);
      if (seekLongPressRef.current) clearInterval(seekLongPressRef.current);
    };
  }, []);

  const startTimeRef = useRef(startTime);
  useEffect(() => { startTimeRef.current = startTime; }, [startTime]);

  /* URL Generation */
  useEffect(() => {
    let watchdogTimer;
    const gen = async () => {
      setIsLoading(true);
      setHasInitiallyLoaded(false);
      let imdbId = movie.imdbId || movie.imdb_id || movie.external_ids?.imdb_id;
      const tid = getNumericId(movie.id);
      if (!tid) { setIsLoading(false); setErrorMessage("No valid content ID."); return; }
      if (!imdbId && activeServerIndex !== 0) {
        try {
          const e = await movieService.getExternalIds(movie.id);
          if (e?.imdb_id) imdbId = e.imdb_id;
        } catch {}
      }
      const isTv = movie?.isSeries || String(movie?.id || "").startsWith("tmdb-tv-");
      // Reload guard: this effect also re-runs on identity-only changes (the
      // caller passes an inline onServerChange + a re-normalized movie object,
      // so every refetch/focus re-render bumps the deps). Only (re)load when
      // the CONTENT or the SERVER actually changed — otherwise the iframe
      // remounts mid-playback, re-fetching the stream from scratch.
      const key = `${tid}|${isTv ? `${season}e${episode}` : "m"}|s${activeServerIndex}`;
      if (genKeyRef.current === key) {
        setIsLoading(false);
        return;
      }
      genKeyRef.current = key;
      // Console trace: which ordered server this session plays (Settings → Server Order).
      logDebug("player", `Loading "${movie?.title || movie?.name || tid}" via server #${activeServerIndex + 1} "${SERVERS[activeServerIndex]?.name || "unknown"}" (${serverCount} in rotation).`, { tid, serverIndex: activeServerIndex, serverCount });
      const sig = `${tid}-${isTv ? season : "m"}-${isTv ? episode : "m"}`;
      const isNew = contentSignatureRef.current !== sig;
      contentSignatureRef.current = sig;
      if (isNew) { setCurrentTime(0); setDuration(0); setBuffered(0); targetSeekTimeRef.current = null; }
      /* Iframe-based servers — resolved from the user's ordered list so the
         Settings → Server Order rotation is what actually plays. */
      let url = VideoSourceAdapter.resolveStreamUrl(SERVERS, activeServerIndex, tid, isTv ? season : null, isTv ? episode : null, imdbId, movie.title);
      const isCineServer = url.includes("cinesrc.st");
      if (isCineServer) {
        if (!isNew && currentTime > 0 && !targetSeekTimeRef.current) url += `&t=${Math.floor(currentTime)}&continueprompt=false`;
        else if (isNew && startTimeRef.current > 0) url += `&t=${Math.floor(startTimeRef.current)}&continueprompt=false`;
      }
      if (isNew && startTimeRef.current > 0 && (url.includes("peachify.top") || url.includes("vidup.to")))
        url += `&startAt=${Math.floor(startTimeRef.current)}`;
      setIframeUrl(url);
      const watchdogDelay = (isCineServer || url.includes("vidcore.io")) ? 20000 : 12000;
      watchdogTimer = setTimeout(() => {
        setIsLoading((prev) => {
          if (prev) {
            setServerErrorCounts((errs) => {
              const si = activeServerIndexRef.current;
              const nc = (errs[si] || 0) + 1;
              if (nc >= 2) {
                setErrorMessage(`Server ${si + 1} timed out`);
                setTimeout(() => {
                  setErrorMessage("");
                  const ni = (si + 1) % serverCount;
                  setActiveServerIndex(ni);
                  onServerChange?.(ni);
                }, 2000);
              } else {
                setErrorMessage("Retrying...");
                setTimeout(() => setErrorMessage(""), 3000);
              }
              return { ...errs, [si]: nc };
            });
            return false;
          }
          return prev;
        });
      }, watchdogDelay);
    };
    gen();
    return () => { if (watchdogTimer) clearTimeout(watchdogTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentTime/onServerChange/setupThumbnailVTT are read but must NOT drive reloads: currentTime changes every timeupdate and would re-init the whole stream, and adding the others would churn the session on every parent render.
  }, [activeServerIndex, movie, season, episode, useNativeControls, failoverToNextServer]);

  const sendCommand = useCallback((c, a = []) => {
    try {
      const w = iframeRef.current?.contentWindow;
      if (!w) return;
      if (isVidCore) {
        // VidCore postMessage protocol: { command: "play" | "pause" | "seek" | "volume" | "mute" | "getStatus", ... }
        switch (c) {
          case "play": w.postMessage({ command: "play" }, "*"); break;
          case "pause": w.postMessage({ command: "pause" }, "*"); break;
          case "seek": w.postMessage({ command: "seek", time: a[0] }, "*"); break;
          case "setVolume": w.postMessage({ command: "volume", level: a[0] }, "*"); break;
          case "setMuted": w.postMessage({ command: "mute", muted: !!a[0] }, "*"); break;
          case "getCurrentTime": case "getDuration": case "getVolume":
          case "getPaused": w.postMessage({ command: "getStatus" }, "*"); break;
          default: break; // no VidCore equivalent (rate/quality/audio) — ignore
        }
        return;
      }
      if (isCineSrc) {
        w.postMessage({ type: "cinesrc:command", command: c, args: a }, "https://cinesrc.st");
      }
      // Peachify publishes no postMessage control API — commands are a no-op.
    } catch { /* iframe cross-origin */ }
  }, [isCineSrc, isVidCore]);

  /* Cycle playback speed for the placeable speed pill. Lives after
     playbackRate/sendCommand so their bindings are initialized. */
  const cycleSpeed = useCallback(() => {
    const i = PLAYER_SPEEDS.indexOf(playbackRate);
    const next = PLAYER_SPEEDS[(i + 1) % PLAYER_SPEEDS.length] ?? 1;
    sendCommand("setPlaybackRate", [next]);
    setPlaybackRate(next);
  }, [playbackRate, sendCommand]);

  /* Background preview lookup for a title key — fires once, never blocks init.
     Preview thumbnails now come only from CineSrc's own player chrome. */

  /* Up Next */
  const startUpNextCountdown = useCallback(() => {
    if (upNextShownRef.current || !hasNextEpisode) return;
    upNextShownRef.current = true;
    setShowUpNext(true);
    if (autoPlayNextRef.current) {
      setUpNextCountdown(15);
      let c = 15;
      upNextIntervalRef.current = setInterval(() => {
        c -= 1;
        setUpNextCountdown(c);
        if (c <= 0) {
          clearInterval(upNextIntervalRef.current);
          setShowUpNext(false);
          if (!hasTriggeredNextRef.current) {
            hasTriggeredNextRef.current = true;
            onNextEpisode?.();
          }
        }
      }, 1000);
    } else {
      setUpNextCountdown(null);
    }
  }, [hasNextEpisode, onNextEpisode]);

  const dismissUpNext = useCallback(() => {
    clearInterval(upNextIntervalRef.current);
    setShowUpNext(false);
  }, []);

  useEffect(() => () => clearInterval(upNextIntervalRef.current), []);

  /* PostMessage Listener */
  useEffect(() => {
    if (!isCineSrc) return;
    const h = (ev) => {
      try {
        if (ev.origin !== "https://cinesrc.st" || !ev.data || typeof ev.data !== "object") return;
        let t, d;
        try { ({ type: t, ...d } = ev.data); } catch { return; }
        switch (t) {
          case "cinesrc:ready":
            sendCommand("setVolume", [isMutedRef.current ? 0 : volumeRef.current]);
            sendCommand("setPlaybackRate", [playbackRate]);
            sendCommand("getCurrentTime");
            sendCommand("getDuration");
            sendCommand("getVolume");
            sendCommand("getPaused");
            sendCommand("getPlaybackRate");
            break;
          case "cinesrc:response":
            switch (d.command) {
              case "getCurrentTime": if (d.result != null && !targetSeekTimeRef.current) setCurrentTime(d.result); break;
              case "getDuration": if (d.result) setDuration(d.result); break;
              case "getVolume": if (d.result != null) setVolume(d.result); break;
              case "getPaused": if (d.result != null) setIsPlaying(!d.result); break;
              case "getPlaybackRate": if (d.result != null) setPlaybackRate(d.result); break;
              case "getAudioTracks": case "getTracks": case "getAudio": if (d.result) setAudioTracks(d.result); break;
              case "getQualities": case "getLevels": case "getResolutions": if (d.result) setQualities(d.result); break;
              case "getCurrentQuality": case "getCurrentLevel": case "getCurrentResolution": case "getQuality": if (d.result != null) setCurrentQuality(d.result); break;
              case "getCurrentAudioTrack": case "getCurrentTrack": if (d.result != null) setCurrentAudioTrack(d.result); break;
              default: break;
            }
            break;
          case "cinesrc:loadedmetadata": if (d.duration) setDuration(d.duration); break;
          case "cinesrc:waiting": setIsLoading(true); break;
          case "cinesrc:seeking": setIsLoading(true); break;
          case "cinesrc:seeked": targetSeekTimeRef.current = null; setIsLoading(false); break;
          case "cinesrc:playing": setIsLoading(false); setIsPlaying(true); setServerErrorCounts({}); break;
          case "cinesrc:progress": if (d.buffered !== undefined) setBuffered(d.buffered); break;
          case "cinesrc:timeupdate":
            if (isLoadingRef.current) setIsLoading(false);
            if (!isScrubbing && !targetSeekTimeRef.current) {
              setCurrentTime(d.currentTime);
              // Debounce progress writes to Firestore — max once per 10 seconds
              const now = Date.now();
              if (now - lastProgressWriteRef.current > 10000) {
                lastProgressWriteRef.current = now;
                onProgressUpdate?.(d.currentTime, d.duration);
              }
              if (hasSubtitlesRef.current) {
                const cue = subtitleEngineRef.current.getActiveCue(d.currentTime + subtitleOffsetRef.current);
                setActiveSubtitleCue((p) => p?.start === cue?.start && p?.end === cue?.end ? p : cue);
              }
            }
            if (d.duration) setDuration(d.duration);
            if (d.buffered !== undefined) setBuffered(d.buffered);
            if (!isScrubbing) setIsLoading(false);
            if (d.duration > 0 && d.currentTime >= d.duration - 30 && hasNextEpisode && !upNextShownRef.current && !isLoopingRef.current) startUpNextCountdown();
            if (d.duration > 0 && d.currentTime >= d.duration - 1 && hasNextEpisode && onNextEpisode && !hasTriggeredNextRef.current && !isLoopingRef.current) {
              hasTriggeredNextRef.current = true;
              clearInterval(upNextIntervalRef.current);
              setShowUpNext(false);
              onNextEpisode();
            }
            break;
          case "cinesrc:ended":
            if (isLoopingRef.current) { sendCommand("seek", [0]); return; }
            if (hasNextEpisode && !hasTriggeredNextRef.current) {
              hasTriggeredNextRef.current = true;
              clearInterval(upNextIntervalRef.current);
              setShowUpNext(false);
              onNextEpisode();
            }
            break;
          case "cinesrc:nextepisode":
            if (!d.internalNavigation && onNextEpisode && !hasTriggeredNextRef.current) {
              hasTriggeredNextRef.current = true;
              onNextEpisode();
            }
            break;
          case "cinesrc:skipintro":
            if (d.time != null) {
              if (autoSkipIntro) {
                sendCommand("seek", [d.time]);
                showToast("Intro skipped");
              } else {
                setSkipIntroTime(d.time);
                setShowSkipIntro(true);
                clearTimeout(skipIntroTimeoutRef.current);
                skipIntroTimeoutRef.current = setTimeout(() => setShowSkipIntro(false), 12000);
              }
            }
            break;
          case "cinesrc:sourceused":
            if (d.sourceId) {
              setActiveSourceId(d.sourceId);
              localStorage.setItem("streamly_lastserver", d.sourceId);
              setLastServer(d.sourceId);
            }
            break;
          case "cinesrc:play": setIsLoading(false); setIsPlaying(true); setServerErrorCounts({}); break;
          case "cinesrc:pause": setIsPlaying(false); if (!isScrubbing) setIsLoading(false); break;
          case "cinesrc:ratechange": setPlaybackRate(d.playbackRate); break;
          case "cinesrc:volumechange":
            if (d.volume !== undefined) setVolume(d.volume);
            if (d.muted !== undefined) setIsMuted(d.muted);
            break;
          case "cinesrc:close":
            if (onClose) onClose();
            else window.history.back();
            break;
          case "cinesrc:error":
            setIsLoading(false);
            const errType = d.error?.type || d.error?.details || 'unknown';
            if (errType === 'networkError' || errType === 'levelLoadTimeOut') break;
            const ei = activeServerIndexRef.current;
            setServerErrorCounts((p) => {
              const nc = (p[ei] || 0) + 1;
              if (nc >= 2) {
                setErrorMessage("Stream unavailable — trying next server");
                setTimeout(() => {
                  setErrorMessage("");
                  const ni = (ei + 1) % serverCount;
                  setActiveServerIndex(ni);
                  onServerChange?.(ni);
                }, 2500);
              } else {
                setErrorMessage("Retrying...");
                setTimeout(() => setErrorMessage(""), 3000);
              }
              return { ...p, [ei]: nc };
            });
            break;
          default: break;
        }
      } catch { /* DataCloneError etc */ }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onServerChange/autoSkipIntro/showToast/onClose are read inside the listener but the listener is keyed to playback state; re-adding it when these parent-provided callbacks change would churn message handling on unrelated re-renders.
  }, [isCineSrc, isScrubbing, playbackRate, sendCommand, hasNextEpisode, onNextEpisode, activeServerIndex, startUpNextCountdown, onProgressUpdate, serverCount]);

  /* External-iframes PostMessage Listener (VidCore + Peachify + VidUp) — events as
     { type: "timeupdate", data: { currentTime, duration, percent } } (VidCore),
     { type: "PLAYER_EVENT", data: { event: "play"|"pause"|"seeked"|"ended"|"timeupdate"|"playerstatus", ... }} (all),
     or { type: "MEDIA_DATA", data: { ... } } (Peachify/VidUp full progress payload for Continue Watching). */
  useEffect(() => {
    if (!isVidCore && !isPeachify && !isVidUp) return;
    const h = (ev) => {
      try {
        if ((ev.origin !== "https://vidcore.io" && ev.origin !== "https://peachify.top" && ev.origin !== "https://vidup.to") || !ev.data || typeof ev.data !== "object") return;
        const d = ev.data;
        let etype = d.type;
        let payload = d.data;
        if (etype === "PLAYER_EVENT" && payload && typeof payload === "object") {
          etype = payload.event;
        }
        if (typeof etype !== "string" || !etype) return;
        switch (etype) {
          case "play": setIsLoading(false); setIsPlaying(true); setServerErrorCounts({}); break;
          case "pause": setIsPlaying(false); setIsLoading(false); break;
          case "seeked": targetSeekTimeRef.current = null; setIsLoading(false); break;
          case "timeupdate": {
            if (isLoadingRef.current) setIsLoading(false);
            if (!isScrubbing && !targetSeekTimeRef.current) {
              const t = payload?.currentTime;
              const dur = payload?.duration;
              if (t != null) setCurrentTime(t);
              if (dur) setDuration(dur);
              // Debounce progress writes to Firestore — max once per 10 seconds
              const now = Date.now();
              if (now - lastProgressWriteRef.current > 10000) {
                lastProgressWriteRef.current = now;
                onProgressUpdate?.(t, dur);
              }
              if (!isScrubbing) setIsLoading(false);
              if (dur > 0 && t >= dur - 30 && hasNextEpisode && !upNextShownRef.current && !isLoopingRef.current) startUpNextCountdown();
              if (dur > 0 && t >= dur - 1 && hasNextEpisode && onNextEpisode && !hasTriggeredNextRef.current && !isLoopingRef.current) {
                hasTriggeredNextRef.current = true;
                clearInterval(upNextIntervalRef.current);
                setShowUpNext(false);
                onNextEpisode();
              }
            }
            break;
          }
          case "ended":
            if (isLoopingRef.current) { sendCommand("seek", [0]); return; }
            if (hasNextEpisode && !hasTriggeredNextRef.current) {
              hasTriggeredNextRef.current = true;
              clearInterval(upNextIntervalRef.current);
              setShowUpNext(false);
              onNextEpisode();
            }
            break;
          case "playerstatus":
            if (payload?.playing !== undefined) setIsPlaying(payload.playing);
            if (payload?.muted !== undefined) setIsMuted(payload.muted);
            if (payload?.volume !== undefined) setVolume(payload.volume);
            if (payload?.currentTime != null) setCurrentTime(payload.currentTime);
            if (payload?.duration != null) setDuration(payload.duration);
            setIsLoading(false);
            break;
          case "MEDIA_DATA":
            // Peachify/VidUp Continue Watching payload — store wholesale for quick restore
            try {
              const mediaId = payload?.id ?? payload?.tmdbId;
              if (mediaId != null) {
                const key = ev.origin === "https://vidup.to" ? "vidUpProgress" : "peachifyProgress";
                const curr = JSON.parse(localStorage.getItem(key) || "{}");
                curr[mediaId] = payload;
                localStorage.setItem(key, JSON.stringify(curr));
              }
            } catch { /* localStorage full / blocked */ }
            break;
          default: break;
        }
      } catch { /* DataCloneError etc */ }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onProgressUpdate (inline parent prop) must not re-attach the listener on every parent render; playback/mute state flows one-way via refs where needed.
  }, [isVidCore, isPeachify, isVidUp, isScrubbing, hasNextEpisode, onNextEpisode, startUpNextCountdown, sendCommand]);

  /* Actions */
  const triggerCenterIcon = useCallback((type) => {
    centerIconKeyRef.current += 1;
    setCenterIcon({ type });
    if (centerIconTimeoutRef.current) clearTimeout(centerIconTimeoutRef.current);
    centerIconTimeoutRef.current = setTimeout(() => setCenterIcon(null), 700);
  }, []);

  const triggerSideIcon = useCallback((type, text) => {
    setSideIcon({ type, text });
    if (sideIconTimeoutRef.current) clearTimeout(sideIconTimeoutRef.current);
    sideIconTimeoutRef.current = setTimeout(() => setSideIcon(null), 700);
  }, []);

  const togglePlay = useCallback((e) => {
    if (e) e.stopPropagation();
    if (isPlaying) {
      sendCommand("pause");
      setIsPlaying(false);
      setShowControls(true);
      if (showCustomUI) triggerCenterIcon("pause");
    } else {
      sendCommand("play");
      setIsPlaying(true);
      if (showCustomUI) triggerCenterIcon("play");
      setShowPausedInfo(false);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3500);
    }
  }, [isPlaying, sendCommand, triggerCenterIcon, showCustomUI]);

  const changeVolume = useCallback((nv) => {
    const v = Math.max(0, Math.min(nv, 1));
    setVolume(v);
    volumeRef.current = v;
    localStorage.setItem("streamly_volume", v.toString());
    sendCommand("setVolume", [v]);
    if (v > 0 && isMuted) {
      setIsMuted(false);
      isMutedRef.current = false;
      localStorage.setItem("streamly_muted", "false");
    }
    if (isTouch) {
      setGestureType("volume");
      setGestureValue(v);
      if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
      gestureHudTimerRef.current = setTimeout(() => setGestureType(null), 1000);
    } else {
      /* Show the circular arc volume HUD on desktop */
      setShowVolumeArc(true);
      if (volumeArcTimerRef.current) clearTimeout(volumeArcTimerRef.current);
      volumeArcTimerRef.current = setTimeout(() => setShowVolumeArc(false), 1200);
    }
  }, [isMuted, sendCommand, isTouch]);

  const toggleMute = useCallback((e) => {
    if (e) e.stopPropagation();
    const n = !isMuted;
    setIsMuted(n);
    isMutedRef.current = n;
    localStorage.setItem("streamly_muted", n.toString());
    if (n) {
      sendCommand("setVolume", [0]);
    } else {
      const restoreVol = volume <= 0 ? 0.7 : volume;
      if (volume <= 0) {
        setVolume(restoreVol);
        volumeRef.current = restoreVol;
        localStorage.setItem("streamly_volume", restoreVol.toString());
      }
      sendCommand("setVolume", [restoreVol]);
    }
    if (isTouch) {
      setGestureType("volume");
      setGestureValue(n ? 0 : volume);
      if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
      gestureHudTimerRef.current = setTimeout(() => setGestureType(null), 1000);
    } else {
      setShowVolumeArc(true);
      if (volumeArcTimerRef.current) clearTimeout(volumeArcTimerRef.current);
      volumeArcTimerRef.current = setTimeout(() => setShowVolumeArc(false), 1200);
    }
  }, [isMuted, volume, sendCommand, isTouch]);

  const seekRelative = useCallback((s, showSideFeedback = true) => {
    const base = targetSeekTimeRef.current ?? currentTime;
    const nt = Math.max(0, Math.min(base + s, duration || Infinity));
    targetSeekTimeRef.current = nt;
    setCurrentTime(nt);
    sendCommand("seek", [nt]);
    seekAccumulatorRef.current += s;
    const a = seekAccumulatorRef.current;
    if (showSideFeedback) {
      if (a > 0) triggerSideIcon("forward", `+${a}s`);
      else if (a < 0) triggerSideIcon("backward", `${a}s`);
    }
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => { seekAccumulatorRef.current = 0; }, 1000);
  }, [currentTime, duration, sendCommand, triggerSideIcon]);

  const showToast = useCallback((msg) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
  }, []);

  const handleSubtitleUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setSubtitleFileName(f.name);
    const r = new FileReader();
    r.onload = (ev) => {
      const t = ev.target.result;
      let p = [];
      if (f.name.endsWith(".srt")) p = SubtitleEngine.parseSRT(t);
      else if (f.name.endsWith(".vtt")) p = SubtitleEngine.parseVTT(t);
      if (p.length > 0) {
        subtitleEngineRef.current.setCues(p);
        setHasSubtitles(true);
        setSubtitleEnabled(true);
        showToast("Subtitles loaded");
      } else showToast("Parse failed");
    };
    r.readAsText(f);
    e.target.value = null;
  };

  const fetchAvailableSubtitles = useCallback(async (silent = false) => {
    const imdbId = movie.imdbId || movie.imdb_id || movie.external_ids?.imdb_id;
    const fq = movie.title ? `${movie.title} ${movie.releaseYear || ""}`.trim() : "";
    if (!imdbId && !fq) return;
    setIsFetchingSubtitles(true);
    if (!silent) showToast("Searching subtitles...");
    try {
      const { SubtitleFetcher } = await import("../api/subtitleFetcher");
      const langs = await SubtitleFetcher.searchAvailableSubtitles(imdbId, fq);
      if (langs.length) {
        setAvailableSubtitleLangs(langs);
        if (!silent) showToast(`Found ${langs.length} languages`);
      } else if (!silent) showToast("No subtitles found");
    } catch {
      if (!silent) showToast("Search failed");
    } finally { setIsFetchingSubtitles(false); }
  }, [movie.imdbId, movie.imdb_id, movie.external_ids, movie.title, movie.releaseYear, showToast]);

  useEffect(() => { fetchAvailableSubtitles(true); }, [fetchAvailableSubtitles, season, episode]);

  const handleSubtitleLanguageSelect = async (link) => {
    if (!link) return;
    const lo = availableSubtitleLangs.find((l) => l.downloadLink === link);
    if (!lo) return;
    showToast(`Downloading ${lo.language}...`);
    setIsFetchingSubtitles(true);
    try {
      const { SubtitleFetcher } = await import("../api/subtitleFetcher");
      const txt = await SubtitleFetcher.downloadAndDecompress(link);
      if (txt) {
        const p = SubtitleEngine.parseSRT(txt);
        if (p.length) {
          subtitleEngineRef.current.setCues(p);
          setHasSubtitles(true);
          setSubtitleEnabled(true);
          setSubtitleFileName(`Auto (${lo.language})`);
          showToast(`${lo.language} loaded!`);
        } else showToast("Empty file");
      } else showToast("Download failed");
    } catch { showToast("Error"); }
    finally { setIsFetchingSubtitles(false); }
  };
  const handleSubtitleLanguageSelectRef = useRef(handleSubtitleLanguageSelect);
  handleSubtitleLanguageSelectRef.current = handleSubtitleLanguageSelect;

  useEffect(() => {
    if (autoSubtitles && !hasSubtitles && availableSubtitleLangs?.length) {
      const match = availableSubtitleLangs.find(
        (l) =>
          l.code?.toLowerCase() === defaultLanguage?.toLowerCase() ||
          l.language?.toLowerCase() === defaultLanguage?.toLowerCase() ||
          (defaultLanguage === "en" && l.language?.toLowerCase().includes("english")),
      ) || availableSubtitleLangs[0];
      if (match?.downloadLink) {
        handleSubtitleLanguageSelectRef.current(match.downloadLink);
      }
    }
  }, [availableSubtitleLangs, autoSubtitles, defaultLanguage, hasSubtitles]);

  const toggleFullscreen = useCallback((e) => {
    if (e) e.stopPropagation();
    const el = containerRef.current;
    if (!isFullscreen) {
      /* Try native fullscreen API */
      const r = el?.requestFullscreen?.() || el?.webkitRequestFullscreen?.();
      /* If promise exists (modern browsers), handle orientation on resolve */
      if (r && typeof r.then === 'function') {
        r.then(() => {
          /* Rotate to landscape on mobile after entering fullscreen */
          if (isTouch && screen.orientation?.lock) {
            screen.orientation.lock('landscape').catch(() => {});
          }
        }).catch(() => {
          /* Fullscreen failed — try Orientation API fallback for iOS */
          if (isTouch && screen.orientation?.lock) {
            screen.orientation.lock('landscape').catch(() => {});
          }
        });
      } else if (isTouch && screen.orientation?.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      if (screen.orientation?.unlock) screen.orientation.unlock();
    }
  }, [isFullscreen, isTouch]);

  const fmt = (t) => {
    if (!t || isNaN(t)) return "0:00";
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    return h > 0
      ? `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`
      : `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  /* Progress Bar */
  const handleProgressScrub = useCallback((e) => {
    // Measure against the actual TRACK — the outer element has horizontal
    // padding, so this makes the seek land exactly where the pointer is.
    const el = progressTrackRef.current || progressBarRef.current;
    if (!el || !duration) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - r.left, r.width));
    const nt = (x / r.width) * duration;
    setCurrentTime(nt);
    targetSeekTimeRef.current = nt;
    sendCommand("seek", [nt]);
  }, [duration, sendCommand]);

  const handleProgressHover = useCallback((e) => {
    const outer = progressBarRef.current;
    const trackEl = progressTrackRef.current;
    if (!outer || !trackEl || !duration) return;
    // Time is derived from the real track; the tooltip is positioned at the
    // pointer inside the padded hit area (clamped so it never leaves the screen).
    const r = trackEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - r.left, r.width));
    setHoverTime((x / r.width) * duration);
    const outerR = outer.getBoundingClientRect();
    const tooltipX = Math.max(outerR.left + 90, Math.min(e.clientX, outerR.right - 90));
    setHoverX(tooltipX - outerR.left);
  }, [duration]);

  const onProgressMouseDown = (e) => {
    e.stopPropagation();
    setIsScrubbing(true);
    handleProgressScrub(e);
  };

  useEffect(() => {
    if (!isScrubbing) return;
    const mm = (e) => handleProgressScrub(e);
    const mu = () => setIsScrubbing(false);
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
    };
  }, [isScrubbing, handleProgressScrub]);

  const triggerBrightnessCycle = useCallback(() => {
    const levels = [1, 1.2, 1.4, 0.6, 0.8];
    const curr = brightnessRef.current;
    const matchIdx = levels.findIndex((l) => Math.abs(l - curr) < 0.08);
    const next = levels[(matchIdx + 1) % levels.length] || 1;
    setBrightness(next);
    brightnessRef.current = next;
    setShowBrightnessArc(true);
    if (brightnessArcTimerRef.current) clearTimeout(brightnessArcTimerRef.current);
    brightnessArcTimerRef.current = setTimeout(() => setShowBrightnessArc(false), 1200);
  }, []);

  /* Keyboard Shortcuts */
  useEffect(() => {
    if (!isCineSrc) return;
    const h = (e) => {
      if (document.activeElement?.tagName === "input" || e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "f": e.preventDefault(); toggleFullscreen(); break;
        case "m": e.preventDefault(); toggleMute(); break;
        case "arrowright": case "l": case ">": case ".": e.preventDefault(); seekRelative(seekStepRef.current); break;
        case "arrowleft": case "j": case "<": case ",": e.preventDefault(); seekRelative(-seekStepRef.current); break;
        case "arrowup": e.preventDefault(); changeVolume(volumeRef.current + 0.1); break;
        case "arrowdown": e.preventDefault(); changeVolume(volumeRef.current - 0.1); break;
        case "a": e.preventDefault(); aspectManuallySetRef.current = true; setAspectRatioIndex((p) => (p + 1) % ASPECT_RATIOS.length); setShowAspectRatioArc(true); if (aspectRatioArcTimerRef.current) clearTimeout(aspectRatioArcTimerRef.current); aspectRatioArcTimerRef.current = setTimeout(() => setShowAspectRatioArc(false), 1200); break;
        case "b": e.preventDefault(); triggerBrightnessCycle(); break;
        case "?": e.preventDefault(); setShowShortcuts((p) => !p); break;
        case "escape": setShowShortcuts(false); setShowSettings(false); setShowSubtitlesMenu(false); setShowAudioMenu(false); break;
        default: break;
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isCineSrc, togglePlay, toggleFullscreen, toggleMute, seekRelative, changeVolume, triggerBrightnessCycle]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !showCustomUI) return;
    const h = (e) => {
      if (showSettings || showSubtitlesMenu || showAudioMenu || showShortcuts) return;
      e.preventDefault();
      changeVolume(volumeRef.current + (e.deltaY < 0 ? 0.05 : -0.05));
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [showCustomUI, changeVolume, showSettings, showSubtitlesMenu, showAudioMenu, showShortcuts]);

  /* ═══ Touch Gestures — VLC/MX Player Style ═══════════════════════════════
     LEFT 35%:   swipe ↑↓ = brightness
     CENTER 30%: swipe ←→ = seek, single-tap = toggle controls, double-tap = seek/play
     RIGHT 35%:  swipe ↑↓ = volume
     ══════════════════════════════════════════════════════════════════════ */
  const handleTouchStart = useCallback((e) => {
    if (!isTouch || !showCustomUI || isScreenLocked) return;
    /* Pinch detection: two fingers */
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartFullscreenRef.current = isFullscreen;
      gestureStartRef.current = null;
      gestureLockRef.current = null;
      return;
    }
    if (e.touches.length > 1) return;
    /* Single finger: record start position */
    const touch = e.touches[0];
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return;
    const relX = (touch.clientX - r.left) / r.width;
    gestureStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      relX,
      zone: relX < 0.35 ? 'left' : relX > 0.65 ? 'right' : 'center',
      startVolume: isMutedRef.current ? 0 : volumeRef.current,
      startBrightness: brightnessRef.current,
      hasMoved: false,
    };
    gestureLockRef.current = null;
  }, [isTouch, showCustomUI, isFullscreen, isScreenLocked]);

  const handleTouchMove = useCallback((e) => {
    if (!isTouch || !showCustomUI || isScreenLocked) return;
    /* Pinch to fullscreen */
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchStartDistRef.current;
      if (ratio > 1.15 && !pinchStartFullscreenRef.current) {
        toggleFullscreen();
        pinchStartDistRef.current = null;
      }
      if (ratio < 0.85 && pinchStartFullscreenRef.current) {
        toggleFullscreen();
        pinchStartDistRef.current = null;
      }
      return;
    }
    if (!gestureStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - gestureStartRef.current.x;
    const dy = gestureStartRef.current.y - touch.clientY; /* positive = up */
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return;

    /* Lock gesture direction after 12px of movement */
    if (!gestureLockRef.current && (absDx > 12 || absDy > 12)) {
      if (absDx > absDy) {
        gestureLockRef.current = 'horizontal'; /* seek */
      } else {
        gestureLockRef.current = 'vertical'; /* brightness or volume */
      }
      gestureStartRef.current.hasMoved = true;
    }

    if (!gestureLockRef.current) return;
    e.preventDefault(); /* Prevent scrolling */
    gestureStartRef.current.hasMoved = true;

    if (gestureLockRef.current === 'vertical') {
      const zone = gestureStartRef.current.zone;
      // Proportional vertical sensitivity: full scale takes 70% player height or min 220px
      const sensitivity = Math.max(220, r.height * 0.7);
      const delta = dy / sensitivity;

      if (zone === 'right') {
        /* Volume: calculated cleanly from startVolume without compounding */
        const newVol = Math.max(0, Math.min(1, gestureStartRef.current.startVolume + delta));
        setVolume(newVol);
        volumeRef.current = newVol;
        localStorage.setItem('streamly_volume', newVol.toString());
        sendCommand('setVolume', [newVol]);
        if (newVol > 0 && isMutedRef.current) {
          setIsMuted(false);
          isMutedRef.current = false;
          localStorage.setItem('streamly_muted', 'false');
        }
        setGestureType('volume');
        setGestureValue(newVol);
      } else if (zone === 'left') {
        /* Brightness: calculated cleanly from startBrightness without compounding */
        // Span is 0.2 to 1.5 = 1.3
        const newBright = Math.max(0.2, Math.min(1.5, gestureStartRef.current.startBrightness + delta * 1.3));
        setBrightness(newBright);
        brightnessRef.current = newBright;
        setGestureType('brightness');
        setGestureValue((newBright - 0.2) / 1.3);
      }
    } else if (gestureLockRef.current === 'horizontal') {
      /* Seek — swipe right = forward, left = backward */
      const seekSensitivity = Math.max(220, r.width * 0.45);
      const seekAmount = (dx / seekSensitivity) * 30; /* 30s per 45% screen width */
      setGestureType('seek');
      setSeekDelta(seekAmount);
    }

    if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
    gestureHudTimerRef.current = setTimeout(() => {
      setGestureType(null);
      setSeekDelta(0);
    }, 800);
  }, [isTouch, showCustomUI, sendCommand, toggleFullscreen, isScreenLocked]);

  const handleTouchEnd = useCallback((e) => {
    lastTouchEndRef.current = Date.now();
    if (gestureLockRef.current === 'horizontal' && gestureStartRef.current) {
      /* Apply seek on release */
      const touch = e.changedTouches[0];
      const dx = touch.clientX - gestureStartRef.current.x;
      const r = containerRef.current?.getBoundingClientRect();
      if (r) {
        const seekSensitivity = Math.max(220, r.width * 0.45);
        const seekAmount = (dx / seekSensitivity) * 30;
        if (Math.abs(seekAmount) > 2) seekRelative(Math.round(seekAmount), false);
      }
    }
    gestureStartRef.current = null;
    gestureLockRef.current = null;
    pinchStartDistRef.current = null;
    if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
    gestureHudTimerRef.current = setTimeout(() => {
      setGestureType(null);
      setSeekDelta(0);
    }, 600);
  }, [seekRelative]);

  /* Auto-hide controls — ignore synthetic mouse events on touch devices */
  const handleMouseMove = useCallback(() => {
    if (isTouch || Date.now() - lastTouchEndRef.current < 600) return;
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying && !showSettings && !showSubtitlesMenu && !showAudioMenu && !isLoading && !isScrubbing) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying, showSettings, showSubtitlesMenu, showAudioMenu, isLoading, isScrubbing, isTouch]);

  /* Touch single-tap to show/hide controls, double-tap to seek */
  const lastTapRef = useRef(0);
  const handleTouchOverlay = useCallback((e) => {
    if (isLoading) return;
    if (isScreenLocked) return;
    // Bail out if user was swiping (volume, brightness, seek) or pinching
    if (gestureStartRef.current?.hasMoved || gestureLockRef.current !== null || pinchStartDistRef.current) {
      return;
    }
    const now = Date.now();
    lastTouchEndRef.current = now; // Suppress synthetic desktop mousemove/clicks
    const tapGap = now - lastTapRef.current;

    if (tapGap < 280 && tapGap > 0) {
      // Double tap detected: cancel pending single-tap toggle and perform seek
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = 0; // Prevent triple-tap retrigger
      e.preventDefault();
      const touch = e.changedTouches[0];
      const r = containerRef.current?.getBoundingClientRect();
      if (!r) return;
      const pct = (touch.clientX - r.left) / r.width;
      if (pct < 0.35) {
        seekRelative(-seekStepRef.current);
        setDoubleTapRipple({ side: "left", id: now });
        setTimeout(() => setDoubleTapRipple(null), 500);
      } else if (pct > 0.65) {
        seekRelative(seekStepRef.current);
        setDoubleTapRipple({ side: "right", id: now });
        setTimeout(() => setDoubleTapRipple(null), 500);
      } else {
        togglePlay();
      }
    } else {
      // Single tap: schedule toggle with 250ms debounce so double-tap can cancel it
      lastTapRef.current = now;
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        // If a popup menu is open, dismiss it first
        if (showSettings || showSubtitlesMenu || showAudioMenu || showShortcuts) {
          setShowSettings(false);
          setShowSubtitlesMenu(false);
          setShowAudioMenu(false);
          setShowShortcuts(false);
          return;
        }
        setShowControls((prev) => {
          const next = !prev;
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
          if (next && isPlaying && !isLoading && !isScrubbing) {
            controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 4500);
          }
          return next;
        });
      }, 250);
    }
  }, [isLoading, isScreenLocked, seekRelative, togglePlay, showSettings, showSubtitlesMenu, showAudioMenu, showShortcuts, isPlaying, isScrubbing]);

  const pp = duration > 0 ? Math.max(0, Math.min((currentTime / duration) * 100, 100)) : 0;
  const bp = duration > 0 ? Math.max(0, Math.min((buffered / duration) * 100, 100)) : 0;
  const controlsVisible = (showControls || isScrubbing) && !isLoading && !isScreenLocked;
  const effVolume = isMuted ? 0 : volume;

  /* ═══════════════════════════════════════════════════════════════
     DYNAMIC TOP-CENTER HUD SYSTEM — shared by the volume + aspect HUDs
       · hudScale: fluid geometry (glyph/ring/pill) tuned to the real
         player box via ResizeObserver, not raw viewport assumptions
       · hudTop: adaptive vertical placement — clears a floating toast /
         error pill when present, then sits pinned top-center
     ═══════════════════════════════════════════════════════════════ */
  const { w: playerW, h: playerH } = useContainerSize(containerRef);
  const hudScale = playerW ? Math.max(0.78, Math.min(1.35, playerW / 1280)) : 1;
  const hudTop = Math.round((toastMessage || errorMessage ? 116 : 56) * hudScale) + 'px';
  const selectedAspect = ASPECT_RATIOS[aspectRatioIndex] || ASPECT_RATIOS[0];

  /* Aspect ratio calculation — dynamic Edge-to-Edge punch-hole camera coverage.
     ═══════════════════════════════════════════════════════════ */
  const isLandscape = playerW > playerH;
  const currentRatio = playerW && playerH ? playerW / playerH : 16 / 9;
  const targetVideoRatio = 16 / 9;
  let mediaTransform = 'none';

  if (selectedAspect.id === 'fit') {
    mediaTransform = 'none';
  } else if (selectedAspect.id === 'fill') {
    // Edge-to-Edge: every pixel of a punch-hole / notch phone gets picture.
    if (isLandscape) {
      const scale = Math.max(1, currentRatio / targetVideoRatio);
      mediaTransform = `scale(${scale.toFixed(4)})`;
    } else {
      const scale = Math.max(1, targetVideoRatio / currentRatio);
      mediaTransform = `scale(${Math.min(scale, 2.4).toFixed(4)})`;
    }
  } else if (selectedAspect.id === 'zoom') {
    const baseZoom = selectedAspect.scale || 1.25;
    const dynamicZoom = isLandscape ? Math.max(baseZoom, currentRatio / targetVideoRatio) : baseZoom;
    mediaTransform = `scale(${dynamicZoom.toFixed(4)})`;
  } else if (selectedAspect.id === 'stretch') {
    if (isLandscape && currentRatio > targetVideoRatio) {
      const scaleX = currentRatio / targetVideoRatio;
      mediaTransform = `scaleX(${scaleX.toFixed(4)}) scaleY(1)`;
    } else if (!isLandscape && currentRatio < targetVideoRatio) {
      const scaleY = targetVideoRatio / currentRatio;
      mediaTransform = `scaleX(1) scaleY(${Math.min(scaleY, 2.5).toFixed(4)})`;
    } else {
      mediaTransform = 'none';
    }
  } else if (selectedAspect.scale) {
    mediaTransform = `scale(${selectedAspect.scale})`;
  }

  /* ── Zone-driven control renderer (Player UI Studio) ───────────────
     Each placeable control renders here for any zone. `variant` is "bar"
     (full control, e.g. volume slider) or "icon" (compact, for the top
     floating zones). Visibility gates + tray zone return null. */
  const barControl = (key, variant = "bar") => {
    if (playerControls[key] === false || uiLayout[key] === "tray") return null;
    const effectiveSkin = playerUIPreset === "custom" ? (playerUISkin || "classic") : playerUIPreset;
    const isApple = effectiveSkin === "apple";
    const isMaterial = effectiveSkin === "material" || effectiveSkin === "compact";
    const isTheater = effectiveSkin === "theater";
    const isStudio = effectiveSkin === "studio";

    const variantStyle =
      playerIconVariants[key] ||
      (playerGlobalIconStyle && playerGlobalIconStyle !== "auto" ? playerGlobalIconStyle : null) ||
      skin.iconVariant ||
      "outline";

    let variantProps = {};
    if (variantStyle === "neon") {
      variantProps = {
        background: "rgba(0, 240, 255, 0.12)",
        border: "1px solid rgba(0, 240, 255, 0.65)",
        color: "#00f0ff",
        boxShadow: "0 0 12px rgba(0, 240, 255, 0.45)",
        borderRadius: "50%",
      };
    } else if (variantStyle === "filled") {
      variantProps = {
        background: "rgba(255, 255, 255, 0.88)",
        border: "none",
        color: "#111115",
        borderRadius: "50%",
      };
    } else if (variantStyle === "glass") {
      variantProps = {
        background: "rgba(255, 255, 255, 0.16)",
        border: "1px solid rgba(255, 255, 255, 0.28)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        color: "#ffffff",
        borderRadius: "999px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
      };
    } else if (variantStyle === "material") {
      variantProps = {
        background: "rgba(230, 225, 235, 0.14)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        color: "#e6e1e5",
        borderRadius: "14px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      };
    } else if (variantStyle === "retro") {
      variantProps = {
        background: "linear-gradient(180deg, rgba(40,40,48,0.92) 0%, rgba(20,20,24,0.96) 100%)",
        border: "1px solid rgba(255, 80, 80, 0.45)",
        color: "#ff5050",
        borderRadius: "4px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 4px rgba(0,0,0,0.6)",
      };
    } else if (variantStyle === "minimal") {
      variantProps = {
        background: "transparent",
        border: "none",
        color: "rgba(255, 255, 255, 0.85)",
        borderRadius: "0px",
        boxShadow: "none",
      };
    } else if (variantStyle === "duotone") {
      variantProps = {
        background: "rgba(255, 209, 102, 0.15)",
        border: "1px solid rgba(255, 209, 102, 0.45)",
        color: "#ffd166",
        boxShadow: "0 0 10px rgba(255, 209, 102, 0.35)",
        borderRadius: "50%",
      };
    } else {
      variantProps = {
        background: isApple
          ? "rgba(255, 255, 255, 0.14)"
          : isMaterial
            ? "rgba(255, 255, 255, 0.08)"
            : isTheater
              ? "rgba(255, 190, 80, 0.12)"
              : isStudio
                ? "rgba(255, 255, 255, 0.06)"
                : "var(--skin-btn-ghost-bg, transparent)",
        border: isApple
          ? "1px solid rgba(255, 255, 255, 0.16)"
          : isMaterial
            ? "none"
            : isTheater
              ? "1px solid rgba(255, 200, 100, 0.28)"
              : isStudio
                ? "1px solid rgba(255, 255, 255, 0.14)"
                : "var(--skin-btn-border, 1px solid rgba(255,255,255,0.16))",
        color: isTheater ? "#ffd166" : isStudio ? "rgba(255,255,255,0.85)" : isMaterial ? "#e6e1e5" : "rgba(255,255,255,0.85)",
        borderRadius: isMaterial ? "16px" : isStudio ? "6px" : isApple ? "999px" : "var(--skin-btn-radius, 50%)",
        backdropFilter: isApple ? "blur(20px)" : undefined,
        WebkitBackdropFilter: isApple ? "blur(20px)" : undefined,
        boxShadow: isTheater ? "0 0 10px rgba(255, 209, 102, 0.25)" : undefined,
      };
    }

    const ghostCircle = {
      cursor: "pointer",
      width: isMaterial ? (isTouch ? 42 : 36) : isApple ? (isTouch ? 42 : 36) : R.btnSmall,
      height: isMaterial ? (isTouch ? 42 : 36) : isApple ? (isTouch ? 42 : 36) : R.btnSmall,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
      ...variantProps,
    };
    if (key === "playPause") {
      let playBg = isMaterial
        ? "#d0bcff"
        : isTheater
          ? "linear-gradient(135deg, rgba(255, 209, 102, 0.35), rgba(255, 158, 44, 0.25))"
          : isStudio
            ? "rgba(255, 59, 78, 0.2)"
            : isApple
              ? "rgba(255, 255, 255, 0.25)"
              : "var(--skin-btn-bg, rgba(255,255,255,0.12))";
      let playColor = isMaterial ? "#1d192b" : isTheater ? "#ffd166" : isStudio ? "#ff3b4e" : "#fff";
      let playBorder = isTheater ? "1px solid rgba(255, 209, 102, 0.6)" : isStudio ? "1px solid #ff3b4e" : isApple ? "1px solid rgba(255, 255, 255, 0.25)" : "var(--skin-btn-border, none)";
      let playRadius = isMaterial ? "20px" : isStudio ? "6px" : isApple ? "999px" : "var(--skin-btn-radius, 50%)";
      let playShadow = isTheater ? "0 0 24px rgba(255, 209, 102, 0.6)" : isMaterial ? "0 4px 14px rgba(208, 188, 255, 0.45)" : isApple ? "0 8px 24px rgba(0,0,0,0.35)" : "var(--skin-chrome-shadow, 0 2px 12px rgba(0,0,0,0.3))";

      if (variantStyle === "neon") {
        playBg = "rgba(0, 240, 255, 0.2)";
        playColor = "#00f0ff";
        playBorder = "1.5px solid #00f0ff";
        playShadow = "0 0 20px rgba(0, 240, 255, 0.7)";
      } else if (variantStyle === "filled") {
        playBg = "#ffffff";
        playColor = "#000000";
        playBorder = "none";
        playShadow = "0 4px 16px rgba(0,0,0,0.4)";
      } else if (variantStyle === "glass") {
        playBg = "rgba(255, 255, 255, 0.28)";
        playBorder = "1.5px solid rgba(255, 255, 255, 0.35)";
        playColor = "#ffffff";
        playShadow = "0 8px 28px rgba(0,0,0,0.4)";
      } else if (variantStyle === "retro") {
        playBg = "rgba(255, 59, 78, 0.35)";
        playColor = "#ff3b4e";
        playBorder = "1px solid #ff3b4e";
        playShadow = "0 0 16px rgba(255, 59, 78, 0.5)";
      } else if (variantStyle === "duotone") {
        playBg = "rgba(255, 209, 102, 0.25)";
        playColor = "#ffd166";
        playBorder = "1.5px solid rgba(255, 209, 102, 0.7)";
        playShadow = "0 0 18px rgba(255, 209, 102, 0.55)";
      }

      return (
        <motion.button
          onClick={togglePlay}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.88 }}
          transition={SPRING}
          aria-label={isPlaying ? "Pause" : "Play"}
          style={{
            background: playBg,
            border: playBorder,
            color: playColor,
            cursor: "pointer",
            width: isApple ? (isTouch ? 46 : 42) : isMaterial ? (isTouch ? 46 : 42) : R.btnMedium,
            height: isApple ? (isTouch ? 46 : 42) : isMaterial ? (isTouch ? 46 : 42) : R.btnMedium,
            borderRadius: playRadius,
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(var(--skin-bar-blur, 16px))",
            WebkitBackdropFilter: "blur(var(--skin-bar-blur, 16px))",
            boxShadow: playShadow,
          }}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
        </motion.button>
      );
    }
    if (key === "jumpForwardBackward") {
      return (
        <>
          <motion.button onClick={(e) => { e.stopPropagation(); seekRelative(-10); }}
            onPointerDown={(e) => {
              e.stopPropagation();
              seekLongPressRef.current = setInterval(() => seekRelative(-10), 300);
            }}
            onPointerUp={() => { clearInterval(seekLongPressRef.current); seekLongPressRef.current = null; }}
            onPointerLeave={() => { clearInterval(seekLongPressRef.current); seekLongPressRef.current = null; }}
            whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
            transition={SPRING}
            aria-label="Back 10 seconds"
            style={ghostCircle}
          >
            <RotateCcw size={15} />
          </motion.button>
          <motion.button onClick={(e) => { e.stopPropagation(); seekRelative(10); }}
            onPointerDown={(e) => {
              e.stopPropagation();
              seekLongPressRef.current = setInterval(() => seekRelative(10), 300);
            }}
            onPointerUp={() => { clearInterval(seekLongPressRef.current); seekLongPressRef.current = null; }}
            onPointerLeave={() => { clearInterval(seekLongPressRef.current); seekLongPressRef.current = null; }}
            whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
            transition={SPRING}
            aria-label="Forward 10 seconds"
            style={ghostCircle}
          >
            <RotateCw size={15} />
          </motion.button>
        </>
      );
    }
    if (key === "volume") {
      if (variant === "icon") {
        return (
          <motion.button onClick={toggleMute}
            whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
            transition={SPRING}
            aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
            style={ghostCircle}
          >
            {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </motion.button>
        );
      }
      return (
        <div
          onMouseEnter={() => setIsVolumeHovered(true)}
          onMouseLeave={() => setIsVolumeHovered(false)}
          onTouchStart={(e) => { e.stopPropagation(); setIsVolumeHovered(!isVolumeHovered); }}
          style={{ display: "flex", alignItems: "center", gap: 0, position: "relative" }}
        >
          <motion.button onClick={toggleMute}
            whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
            transition={SPRING}
            aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
            style={ghostCircle}
          >
            <AnimatePresence mode="wait">
              <motion.div key={isMuted || volume === 0 ? "off" : "on"}
                initial={{ scale: 0.5, opacity: 0, rotate: -20 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0, rotate: 20 }}
                transition={SPRING_FAST}
              >
                {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </motion.div>
            </AnimatePresence>
          </motion.button>
          {/* Volume bar: always visible on touch, hover-expand on desktop */}
          <motion.div
            initial={false}
            animate={{ width: (isTouch && isVolumeHovered) || (!isTouch && isVolumeHovered) ? 64 : isTouch ? 48 : 0, opacity: (isTouch && isVolumeHovered) || (!isTouch && isVolumeHovered) || (isTouch && controlsVisible) ? 1 : 0 }}
            transition={SPRING}
            style={{ overflow: "hidden", position: "relative", height: 24, display: "flex", alignItems: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={volumeBarRef}
              style={{
                width: "clamp(44px, 8vw, 56px)", height: 4, borderRadius: 2,
                background: "rgba(255,255,255,0.1)", position: "relative",
                cursor: "pointer",
                touchAction: "none",
              }}
              onMouseDown={(e) => {
                e.stopPropagation(); e.preventDefault();
                isDraggingVolumeRef.current = true;
                const r = e.currentTarget.getBoundingClientRect();
                const x = Math.max(0, Math.min(e.clientX - r.left, r.width));
                changeVolume(x / r.width);
                const mm = (ev) => {
                  if (!isDraggingVolumeRef.current || !volumeBarRef.current) return;
                  const rr = volumeBarRef.current.getBoundingClientRect();
                  const xx = Math.max(0, Math.min(ev.clientX - rr.left, rr.width));
                  changeVolume(xx / rr.width);
                };
                const mu = () => {
                  isDraggingVolumeRef.current = false;
                  window.removeEventListener("mousemove", mm);
                  window.removeEventListener("mouseup", mu);
                };
                window.addEventListener("mousemove", mm);
                window.addEventListener("mouseup", mu);
              }}
              onTouchStart={(e) => {
                e.stopPropagation(); e.preventDefault();
                isDraggingVolumeRef.current = true;
                const touch = e.touches[0];
                const r = e.currentTarget.getBoundingClientRect();
                const x = Math.max(0, Math.min(touch.clientX - r.left, r.width));
                changeVolume(x / r.width);
              }}
              onTouchMove={(e) => {
                if (!isDraggingVolumeRef.current || !volumeBarRef.current) return;
                const touch = e.touches[0];
                const r = volumeBarRef.current.getBoundingClientRect();
                const x = Math.max(0, Math.min(touch.clientX - r.left, r.width));
                changeVolume(x / r.width);
              }}
              onTouchEnd={() => { isDraggingVolumeRef.current = false; }}
            >
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: `${effVolume * 100}%`,
                background: "var(--accent-gradient, rgba(255,255,255,0.8))",
                borderRadius: 2,
                transition: isDraggingVolumeRef.current ? "none" : "width 0.1s ease",
              }} />
              <div style={{
                position: "absolute", top: "50%",
                left: `${effVolume * 100}%`,
                transform: "translate(-50%, -50%)",
                width: 10, height: 10, borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                transition: isDraggingVolumeRef.current ? "none" : "left 0.1s ease",
              }} />
            </div>
          </motion.div>
        </div>
      );
    }
    if (key === "subtitles") {
      return (
        <motion.button onClick={(e) => { e.stopPropagation(); setShowSubtitlesMenu(!showSubtitlesMenu); setShowSettings(false); }}
          whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
          transition={SPRING}
          aria-label="Subtitles"
          style={{
            ...ghostCircle,
            position: "relative",
            ...(subtitleEnabled || showSubtitlesMenu ? {
              borderColor: "var(--accent-primary, #fff)",
              boxShadow: "0 0 8px var(--accent-primary, rgba(255,255,255,0.4))",
            } : {}),
          }}
        >
          <Captions size={15} />
          {subtitleEnabled && <div style={{ position: "absolute", top: 4, right: 4, width: "clamp(3px, 0.5vw, 4px)", height: "clamp(3px, 0.5vw, 4px)", background: "var(--accent-primary, #fff)", borderRadius: "50%" }} />}
        </motion.button>
      );
    }
    if (key === "audio") {
      if (!(audioTracks?.length > 1)) return null;
      return (
        <motion.button onClick={(e) => { e.stopPropagation(); setShowAudioMenu(!showAudioMenu); setShowSettings(false); setShowSubtitlesMenu(false); }}
          whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
          transition={SPRING}
          aria-label="Audio tracks"
          style={{
            ...ghostCircle,
            position: "relative",
            ...(showAudioMenu ? {
              borderColor: "var(--accent-primary, #fff)",
              boxShadow: "0 0 8px var(--accent-primary, rgba(255,255,255,0.4))",
            } : {}),
          }}
        >
          <AudioLines size={15} />
        </motion.button>
      );
    }
    if (key === "aspectRatio") {
      const arMeta = ASPECT_RATIOS[aspectRatioIndex] || ASPECT_RATIOS[0];
      const isStudio = skin.id === "studio";
      const isTheater = skin.id === "theater";
      const isMaterial = skin.id === "material";
      return (
        <motion.button onClick={(e) => {
            e.stopPropagation();
            aspectManuallySetRef.current = true;
            setAspectRatioIndex((p) => (p + 1) % ASPECT_RATIOS.length);
            setShowAspectRatioArc(true);
            if (aspectRatioArcTimerRef.current) clearTimeout(aspectRatioArcTimerRef.current);
            aspectRatioArcTimerRef.current = setTimeout(() => setShowAspectRatioArc(false), 1200);
          }}
            whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
            transition={SPRING}
            aria-label={`Change aspect ratio (${arMeta.name})`}
            title={`Aspect Ratio: ${arMeta.name}`}
            style={{
              ...ghostCircle,
              position: "relative",
              ...(isTheater ? { borderColor: "rgba(255,200,100,0.45)", color: "#ffd166" } : {}),
              ...(isMaterial ? { borderRadius: "14px" } : {}),
              ...(isStudio ? { borderRadius: "3px", borderColor: "rgba(255,59,78,0.4)" } : {}),
            }}
          >
            <Maximize size={14} strokeWidth={2} />
            <span style={{
              position: "absolute", bottom: -1, right: -1,
              fontSize: "7px", fontWeight: 800,
              color: isTheater ? "#ffd166" : isMaterial ? "#d0bcff" : isStudio ? "#00e5ff" : (ghostCircle.color || "rgba(255,255,255,0.7)"),
              lineHeight: 1, fontFamily: isStudio ? "'SF Mono', monospace" : isTheater ? "Georgia, serif" : "-apple-system, BlinkMacSystemFont, sans-serif",
            }}>{aspectRatioIndex + 1}</span>
          </motion.button>
      );
    }
    if (key === "playbackSpeed") {
      return (
        <motion.button onClick={(e) => { e.stopPropagation(); cycleSpeed(); }}
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}
          transition={SPRING}
          aria-label={`Playback speed ${playbackRate}x. Activate to change.`}
          title={`Speed: ${playbackRate}x`}
          style={{
            background: playbackRate !== 1 ? "rgba(var(--accent-primary-rgb), 0.16)" : "rgba(255,255,255,0.08)",
            border: playbackRate !== 1 ? "1px solid rgba(var(--accent-primary-rgb), 0.4)" : "1px solid rgba(255,255,255,0.1)",
            color: playbackRate !== 1 ? "var(--accent-primary, #fff)" : "#fff",
            cursor: "pointer", height: R.btnSmall, padding: "0 10px", borderRadius: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
          }}
        >
          {playbackRate}x
        </motion.button>
      );
    }
    if (key === "screenLock") {
      // Touch top-left already has the floating lock button — never double it.
      if (variant === "icon" && uiLayout.screenLock === "topLeft" && isTouch) return null;
      return (
        <motion.button onClick={(e) => {
            e.stopPropagation();
            setIsScreenLocked(true);
            setShowControls(false);
            setToastMessage("Controls Locked");
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
          }}
          whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
          transition={SPRING}
          aria-label="Lock screen controls"
          style={ghostCircle}
        >
          <Unlock size={15} />
        </motion.button>
      );
    }
    if (key === "fullscreen") {
      return (
        <motion.button onClick={toggleFullscreen}
          whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
          transition={SPRING}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          style={ghostCircle}
        >
          {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
        </motion.button>
      );
    }
    if (key === "pip") {
      return (
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            setToastMessage("Picture-in-Picture mode");
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
          }}
          whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
          transition={SPRING}
          aria-label="Picture in picture"
          style={ghostCircle}
        >
          <PictureInPicture2 size={15} />
        </motion.button>
      );
    }
    if (key === "nextEpisode") {
      return (
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            if (onNextEpisode && hasNextEpisode) {
              onNextEpisode();
            } else {
              setToastMessage("No next episode");
              if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
              toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
            }
          }}
          whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
          transition={SPRING}
          aria-label="Next episode"
          style={{ ...ghostCircle, opacity: hasNextEpisode ? 1 : 0.5 }}
        >
          <SkipForward size={15} />
        </motion.button>
      );
    }
    if (key === "cast") {
      return (
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            setToastMessage("Searching for Cast devices...");
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
          }}
          whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
          transition={SPRING}
          aria-label="Cast to device"
          style={ghostCircle}
        >
          <Cast size={15} />
        </motion.button>
      );
    }
    if (key === "loop") {
      return (
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            setIsLooping((prev) => {
              const next = !prev;
              setToastMessage(`Loop ${next ? "Enabled" : "Disabled"}`);
              if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
              toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
              return next;
            });
          }}
          whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
          transition={SPRING}
          aria-label="Loop playback"
          style={{ ...ghostCircle, color: isLooping ? "var(--skin-accent, #6366f1)" : ghostCircle.color }}
        >
          <Repeat size={15} />
        </motion.button>
      );
    }
    if (key === "brightness") {
      const isTheater = skin.id === "theater";
      const isMaterial = skin.id === "material";
      const isStudio = skin.id === "studio";
      return (
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            triggerBrightnessCycle();
          }}
          whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
          transition={SPRING}
          aria-label={`Brightness ${Math.round(brightness * 100)}%`}
          title={`Brightness: ${Math.round(brightness * 100)}%`}
          style={{
            ...ghostCircle,
            position: "relative",
            ...(isTheater ? { borderColor: "rgba(255,200,100,0.45)", color: "#ffd166" } : {}),
            ...(isMaterial ? { borderRadius: "14px" } : {}),
            ...(isStudio ? { borderRadius: "3px", borderColor: "rgba(255,59,78,0.4)" } : {}),
          }}
        >
          <Sun size={15} strokeWidth={2} />
          <span style={{
            position: "absolute", bottom: -1, right: -1,
            fontSize: "7px", fontWeight: 800,
            lineHeight: 1,
            color: isTheater ? "#ffd166" : isMaterial ? "#d0bcff" : isStudio ? "#00e5ff" : (ghostCircle.color || "rgba(255,255,255,0.7)"),
            fontFamily: isStudio ? "'SF Mono', monospace" : isTheater ? "Georgia, serif" : "-apple-system, BlinkMacSystemFont, sans-serif",
          }}>
            {brightness === 1 ? "" : `${Math.round(brightness * 10)}`}
          </span>
        </motion.button>
      );
    }
    if (key === "chapters") {
      return (
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            setToastMessage("Chapters: Episode 1");
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
          }}
          whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
          transition={SPRING}
          aria-label="Chapters"
          style={ghostCircle}
        >
          <BookMarked size={15} />
        </motion.button>
      );
    }
    return null;
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER — Apple TV+ inspired player
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div
      ref={containerRef}
      data-player-skin={skin.id}
      className={`streamly-player${isTouch ? ' streamly-player--touch' : ''}${isFullscreen ? ' streamly-player--fullscreen' : ''}`}
      style={{
        position: isFullscreen ? 'fixed' : 'relative',
        width: '100%',
        aspectRatio: isFullscreen || isTouch ? undefined : '16/9',
        height: isFullscreen ? '100dvh' : (isTouch ? '100%' : 'auto'),
        minHeight: isTouch && !isFullscreen ? 0 : undefined,
        maxHeight: isFullscreen || isTouch ? '100dvh' : 'min(calc(100vh - 120px), 80vw)',
        background: '#000',
        borderRadius: isFullscreen || isTouch ? 0 : 12,
        inset: isFullscreen ? '0' : undefined,
        zIndex: isFullscreen ? 9999 : undefined,
        overflow: 'hidden',
        cursor: controlsVisible || !showCustomUI ? 'default' : 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
        WebkitTouchCallout: 'none',
        /* Safe areas protect controls while media reaches the physical edge */
        '--sat': 'env(safe-area-inset-top, 0px)',
        '--sab': 'env(safe-area-inset-bottom, 0px)',
        '--sal': 'env(safe-area-inset-left, 0px)',
        '--sar': 'env(safe-area-inset-right, 0px)',
        /* Player UI Studio skin tokens — every themed surface reads these */
        ...skinVars,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (isPlaying && !showSettings && !showSubtitlesMenu && !showAudioMenu && !isLoading && !isScrubbing)
          setShowControls(false);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => {
        if (!showCustomUI) return;
        e.preventDefault();
        const r = containerRef.current.getBoundingClientRect();
        setContextMenu({
          show: true,
          x: Math.min(e.clientX - r.left, r.width - 200),
          y: Math.min(e.clientY - r.top, r.height - 260),
        });
      }}
    >
      {/* IFRAME */}
      {iframeUrl && (
        <iframe
          ref={iframeRef}
          key={`iframe-${activeServerIndex}-${useNativeControls}`}
          src={iframeUrl}
          title="Video player"
          style={{
            position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', border: 'none', background: '#000', overflow: 'visible',
            pointerEvents: isCineSrc ? 'auto' : (showCustomUI ? 'none' : 'auto'),
            opacity: hasInitiallyLoaded ? 1 : 0,
            transition: 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: brightness !== 1 ? `brightness(${brightness})` : undefined,
            transform: mediaTransform,
            transformOrigin: 'center center',
          }}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          onLoad={() => {
            if (isCineSrc) {
              /* Do NOT set isLoading=false here — wait for cinesrc:playing
                 so CineSrc's own spinner stays hidden behind our overlay */
            } else if (isVidCore) {
              // Native UI mode: pull the current playback state into our player
              // so Continue Watching and up-next logic stay in sync.
              setIsLoading(false);
              setServerErrorCounts({});
              setTimeout(() => {
                const w = iframeRef.current?.contentWindow;
                if (w && iframeUrl.includes("vidcore.io"))
                  w.postMessage({ command: "getStatus" }, "*");
              }, 600);
            } else {
              setIsLoading(false);
              setServerErrorCounts({}); // Reset error count on successful load
            }
          }}
        />
      )}

      {/* CineSrc interaction overlay — handles mouse (desktop) and touch (mobile) */}
      {showCustomUI && (
        <div
          onMouseMove={handleMouseMove}
          onClick={(e) => {
            e.stopPropagation();
            // Skip if a touch just handled this (prevents double-fire on mobile)
            if (Date.now() - lastTouchEndRef.current < 500) return;
            // Desktop: click to play/pause, double-click to seek/fullscreen
            if (clickTimeoutRef.current) {
              clearTimeout(clickTimeoutRef.current);
              clickTimeoutRef.current = null;
              const r = containerRef.current.getBoundingClientRect();
              const pct = (e.clientX - r.left) / r.width;
              if (pct < 0.3) {
                seekRelative(-10);
                setDoubleTapRipple({ side: "left", id: Date.now() });
                setTimeout(() => setDoubleTapRipple(null), 500);
              } else if (pct > 0.7) {
                seekRelative(10);
                setDoubleTapRipple({ side: "right", id: Date.now() });
                setTimeout(() => setDoubleTapRipple(null), 500);
              } else {
                toggleFullscreen();
              }
            } else {
              clickTimeoutRef.current = setTimeout(() => {
                clickTimeoutRef.current = null;
                togglePlay();
              }, 250);
            }
          }}
          onTouchEnd={handleTouchOverlay}
          style={{ position: "absolute", inset: 0, zIndex: 9, cursor: controlsVisible ? "default" : "none" }}
        />
      )}

      {/* Subtitles */}
      {showCustomUI && subtitleEnabled && hasSubtitles && activeSubtitleCue && (
        <div style={{
          position: "absolute", bottom: controlsVisible ? "calc(clamp(60px, 12vw, 100px) + var(--sab))" : "calc(clamp(20px, 4vw, 36px) + var(--sab))",
          left: 0, right: 0, display: "flex", justifyContent: "center",
          pointerEvents: "none", zIndex: 15,
          transition: "bottom 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSubtitleCue.text}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{
                color: subtitleColor || "#fff",
                padding: isTouch ? "2px 8px" : `${R.padSmall} ${R.padLarge}`,
                fontSize: `calc(clamp(15px, 2.5vw, 24px) * ${(subtitleSize || 100) / 100})`,
                fontFamily: subtitleFont === "montserrat" ? "'Montserrat', sans-serif" : (subtitleFont === "netflix" ? "'Arial', sans-serif" : "'Inter', sans-serif"),
                lineHeight: 1.35,
                fontWeight: 600,
                textAlign: "center",
                maxWidth: "88%",
                whiteSpace: "pre-wrap",
                background: subtitleBgBlur ? (isTouch ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.6)") : (isTouch ? "transparent" : "rgba(0,0,0,0.5)"),
                borderRadius: subtitleBgBlur ? 8 : (isTouch ? 0 : 6),
                backdropFilter: subtitleBgBlur ? "blur(8px)" : "none",
                WebkitBackdropFilter: subtitleBgBlur ? "blur(8px)" : "none",
                textShadow: isTouch
                  ? "0 2px 4px rgba(0,0,0,0.95), 0 0 2px #000, 0 0 12px rgba(0,0,0,0.95), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000"
                  : "0 1px 8px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.8)",
              }}
            >
              {activeSubtitleCue.text}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Bottom vignette — skinned per Player UI preset */}
      {showCustomUI && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 11, pointerEvents: "none",
          background: "var(--skin-scrim, linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 15%, transparent 35%))",
          transition: "opacity 0.4s", opacity: controlsVisible ? 1 : 0,
        }} />
      )}

      {/* Skin vignette — Theater's opera-box edge darkening (decor only) */}
      {showCustomUI && skin.vignette && skin.vignette !== "none" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 12, pointerEvents: "none",
          background: "var(--skin-vignette)",
        }} />
      )}

      {/* ═══ CENTER PLAY/PAUSE ═══════════════════════════════════ */}
      <AnimatePresence>
        {showCustomUI && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: controlsVisible ? 0 : (isPlaying ? 0 : 0.8) }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute", inset: 0, zIndex: 13,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <AnimatePresence mode="wait">
              {centerIcon ? (
                <motion.div
                  key={centerIcon.type + centerIconKeyRef.current}
                  {...entranceVariants.center}
                  style={{
                    width: "clamp(56px, 10vw, 76px)", height: "clamp(56px, 10vw, 76px)", borderRadius: "var(--skin-hud-radius, 50%)",
                    background: "var(--skin-center-icon-bg, rgba(0,0,0,0.35))", backdropFilter: "blur(var(--skin-center-icon-blur, 24px))",
                    WebkitBackdropFilter: "blur(var(--skin-center-icon-blur, 24px))",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "var(--skin-center-icon-border, 1px solid rgba(255,255,255,0.08))",
                  }}
                >
                  {/* Expanding arc ring — the Apple motif */}
                  <motion.div
                    initial={{ opacity: 0.6, scale: 0.8 }}
                    animate={{ opacity: 0, scale: 2.2 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    style={{ position: "absolute", inset: -2 }}
                  >
                    <svg width="76" height="76" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="38" cy="38" r="34" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 34 * 0.25} ${2 * Math.PI * 34 * 0.75}`} />
                    </svg>
                  </motion.div>
                  {centerIcon.type === "play"
                    ? <Play size={30} fill={skin.centerIconTone === "flat-red" || skin.centerIconTone === "gilded" ? skin.accent : "#fff"} color={skin.centerIconTone === "flat-red" || skin.centerIconTone === "gilded" ? skin.accent : "#fff"} style={{ marginLeft: 3 }} />
                    : <Pause size={30} fill={skin.centerIconTone === "flat-red" || skin.centerIconTone === "gilded" ? skin.accent : "#fff"} color={skin.centerIconTone === "flat-red" || skin.centerIconTone === "gilded" ? skin.accent : "#fff"} />}
                </motion.div>
              ) : !isPlaying && !controlsVisible ? (
                <motion.div
                  key="big-play"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 0.6, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={SPRING}
                  style={{
                    width: "clamp(52px, 9vw, 68px)", height: "clamp(52px, 9vw, 68px)", borderRadius: "var(--skin-hud-radius, 50%)",
                    background: "var(--skin-center-icon-bg, rgba(0,0,0,0.35))", backdropFilter: "blur(var(--skin-center-icon-blur, 20px))",
                    WebkitBackdropFilter: "blur(var(--skin-center-icon-blur, 20px))",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "var(--skin-center-icon-border, 1px solid rgba(255,255,255,0.06))",
                  }}
                >
                  <Play size={26} fill={skin.centerIconTone === "flat-red" || skin.centerIconTone === "gilded" ? skin.accent : "#fff"} color={skin.centerIconTone === "flat-red" || skin.centerIconTone === "gilded" ? skin.accent : "#fff"} style={{ marginLeft: 2 }} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ PAUSED INFO OVERLAY ═════════════════════════════════ */}
      <AnimatePresence>
        {showPausedInfo && showCustomUI && !isPlaying && controlsVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute", inset: 0, zIndex: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.65)", backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              pointerEvents: "none",
            }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={{
                display: "flex", gap: isTouch ? "clamp(12px, 3vw, 24px)" : "clamp(20px, 4vw, 36px)",
                alignItems: "center", maxWidth: "min(640px, 88%)", padding: isTouch ? "0 clamp(12px, 3vw, 24px)" : `0 ${R.padLarge}`,
              }}
            >
              {(movie?.posterUrl || thumbnailUrl) && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  style={{
                    width: isTouch ? "clamp(60px, 16vw, 110px)" : "clamp(80px, 14vw, 150px)", aspectRatio: "2/3",
                    borderRadius: 12, overflow: "hidden", flexShrink: 0,
                    boxShadow: "0 24px 64px rgba(0,0,0,0.85)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <img
                    src={movie?.posterUrl || thumbnailUrl}
                    alt="" loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </motion.div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)", marginBottom: isTouch ? 6 : 10 }}>
                  <div style={{
                    width: "clamp(20px, 3.5vw, 28px)", height: "clamp(20px, 3.5vw, 28px)", borderRadius: "50%",
                    background: "rgba(255,255,255,0.06)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}>
                    <Pause size={isTouch ? 10 : 12} fill="rgba(255,255,255,0.8)" color="rgba(255,255,255,0.8)" />
                  </div>
                  <span style={{
                    color: "rgba(255,255,255,0.5)", fontSize: R.fontTiny, fontWeight: 700,
                    letterSpacing: "2.5px", textTransform: "uppercase",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  }}>Paused</span>
                </div>
                {movie?.logoUrl ? (
                  <img
                    src={movie.logoUrl} alt={movie?.title}
                    style={{
                      maxHeight: isTouch ? "clamp(32px, 6vw, 56px)" : "clamp(40px, 8vw, 72px)", width: "auto",
                      maxWidth: "min(380px, 72vw)", objectFit: "contain",
                      filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.95))",
                      marginBottom: isTouch ? 4 : 8,
                    }}
                    onError={(e) => {
                      const img = e.target;
                      img.style.display = 'none';
                      if (img.nextSibling) img.nextSibling.style.display = 'block';
                    }}
                  />
                ) : null}
                <div style={{
                  color: "#fff", fontWeight: 800,
                  fontSize: isTouch ? "clamp(1.1rem, 2.6vw, 1.8rem)" : "clamp(1.3rem, 3.2vw, 2.2rem)", lineHeight: 1.05,
                  marginBottom: isTouch ? 6 : 8, letterSpacing: "-0.03em",
                  display: movie?.logoUrl ? 'none' : 'block',
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                }}>
                  {movie?.title || movie?.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: isTouch ? "4px 8px" : "clamp(6px, 1.5vw, 10px)", marginBottom: isTouch ? 6 : 12, flexWrap: "wrap" }}>
                  {movie?.releaseYear && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: isTouch ? R.fontMedium : R.fontLarge, fontWeight: 600, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>{movie.releaseYear}</span>}
                  {movie?.imdbRating > 0 && <span style={{ color: "#FBBF24", fontSize: isTouch ? R.fontMedium : R.fontLarge, fontWeight: 700 }}>★ {movie.imdbRating}</span>}
                  {isTvContent && season && <span style={{ color: "rgba(255,255,255,0.7)", fontSize: isTouch ? R.fontMedium : R.fontLarge, fontWeight: 700, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>S{season} E{episode}</span>}
                  {movie?.duration && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: isTouch ? R.fontMedium : R.fontLarge, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>{movie.duration}</span>}
                  {movie?.genres?.slice(0, 3).map((g, i) => (
                    <span key={i} style={{ color: "rgba(255,255,255,0.4)", fontSize: R.fontSmall, fontWeight: 600, background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 6, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>{g}</span>
                  ))}
                </div>
                {(movie?.longDescription || movie?.description || movie?.overview) && (
                  <div style={{
                    color: "rgba(255,255,255,0.55)", fontSize: "clamp(0.75rem, 1.2vw, 0.92rem)",
                    lineHeight: 1.55, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    display: (playerH && playerH < 440) ? "none" : "-webkit-box",
                    WebkitLineClamp: isTouch ? 2 : 4,
                    WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>
                    {movie?.longDescription || movie?.description || movie?.overview}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading — Apple TV+ style: blurred poster backdrop + arc spinner */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              position: "absolute", inset: 0, zIndex: 5,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {/* Blurred poster backdrop — Apple TV+ style */}
            {thumbnailUrl ? (
              <div style={{
                position: "absolute", inset: -40,
                backgroundImage: `url(${thumbnailUrl})`,
                backgroundSize: "cover", backgroundPosition: "center",
                filter: "blur(30px) brightness(0.25) saturate(1.2)",
                transform: "scale(1.1)",
              }} />
            ) : (
              <div style={{
                position: "absolute", inset: 0,
                background: "radial-gradient(ellipse at 50% 40%, #0a0a0f 0%, #000 70%)",
              }} />
            )}
            {/* Dark vignette overlay for text readability */}
            <div style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.65) 100%)",
            }} />
            {/* Content layer */}
            <div style={{
              position: "relative", zIndex: 1,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: "clamp(12px, 3vw, 20px)",
              padding: "0 20px",
            }}>
              <LoadingArc size={56} strokeWidth={2.5} progress={loadProgress} />
              {!hasInitiallyLoaded && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  style={{ textAlign: "center" }}
                >
                  <div style={{
                    color: "#fff", fontSize: "clamp(1rem, 2.5vw, 1.5rem)", fontWeight: 700, marginBottom: 6,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                    letterSpacing: "-0.02em",
                    textShadow: "0 2px 12px rgba(0,0,0,0.5)",
                  }}>
                    {movie?.title || movie?.name || "Loading"}
                  </div>
                  {isTvContent && season && (
                    <div style={{
                      color: "rgba(255,255,255,0.5)", fontSize: R.fontMedium, fontWeight: 600,
                      marginBottom: 8,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}>
                      Season {season} · Episode {episode}
                    </div>
                  )}
                  <motion.div
                    key={currentTipIndex}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.3 }}
                    style={{
                      color: "rgba(255,255,255,0.3)", fontSize: R.fontSmall, fontWeight: 500,
                      letterSpacing: "0.3px",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}
                  >
                    {dynamicTips[currentTipIndex]?.text}
                  </motion.div>
                  {/* Thin progress bar */}
                  <div style={{
                    marginTop: 12, width: "clamp(100px, 30vw, 180px)", height: 2,
                    background: "rgba(255,255,255,0.06)", borderRadius: 1,
                    overflow: "hidden",
                  }}>
                    <motion.div
                      animate={{ width: `${loadProgress * 100}%` }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      style={{
                        height: "100%", borderRadius: 1,
                        background: "linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4))",
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error pill */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
              background: "rgba(255,69,58,0.85)", color: "#fff",
              padding: `${R.padSmall} clamp(10px, 2vw, 16px)`, borderRadius: 100,
              backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
              display: "flex", alignItems: "center", gap: "clamp(4px, 1vw, 6px)",
              zIndex: 60, fontWeight: 600, fontSize: R.fontSmall,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
            }}
          >
            <AlertCircle size={12} /> {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast — fully skinned (surface, radius, blur, border, font) */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -5, x: "-50%" }}
            transition={{ duration: (skin.motionMs || 250) / 1000, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute", top: 16, left: "50%",
              background: "var(--skin-toast-bg, rgba(28,28,30,0.78))", color: "#fff",
              padding: `${R.padSmall} clamp(10px, 2vw, 16px)`, borderRadius: "var(--skin-hud-radius, 18px)",
              backdropFilter: "blur(var(--skin-hud-blur, 40px)) saturate(180%)",
              WebkitBackdropFilter: "blur(var(--skin-hud-blur, 40px)) saturate(180%)",
              border: "var(--skin-hud-border, 1px solid rgba(255,255,255,0.08))",
              boxShadow: "var(--skin-hud-shadow, none)",
              zIndex: 62, fontWeight: 600, fontSize: R.fontSmall, pointerEvents: "none",
              fontFamily: "var(--skin-hud-font, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif)",
            }}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ VOLUME HUD ═══ */}
      <AnimatePresence>
        {showVolumeArc && !isTouch && (
          <PresetVolumeHUD
            skin={skin}
            effVolume={effVolume}
            isMuted={isMuted}
            volume={volume}
            hudScale={hudScale}
            hudTop={hudTop}
          />
        )}
      </AnimatePresence>

      {/* ═══ BRIGHTNESS HUD (Desktop) ═══ */}
      <AnimatePresence>
        {showBrightnessArc && !isTouch && (
          <PresetBrightnessHUD
            skin={skin}
            brightness={brightness}
            hudScale={hudScale}
            hudTop={hudTop}
          />
        )}
      </AnimatePresence>

      {/* ═══ ASPECT RATIO HUD ═══ */}
      <AnimatePresence>
        {showAspectRatioArc && (
          <PresetAspectRatioHUD
            skin={skin}
            aspectRatioIndex={aspectRatioIndex}
            hudScale={hudScale}
            hudTop={hudTop}
            isTouch={isTouch}
          />
        )}
      </AnimatePresence>

      {/* ═══ TOUCH GESTURE HUDS — VLC/MX Player Style (Skin Adaptable) ═══════ */}
      {/* Brightness vertical bar — left edge */}
      <AnimatePresence>
        {gestureType === 'brightness' && isTouch && (() => {
          const skinId = skin?.id || "classic";
          const sunColor = skinId === "theater" ? "#ffd166" : skinId === "material" ? "var(--skin-accent, #d0bcff)" : skinId === "studio" ? "#00e5ff" : skinId === "minimal" ? "#ffffff" : "#FBBF24";
          const trackGradient = skinId === "theater" ? "linear-gradient(to top, #b8860b, #ffd166)" : skinId === "material" ? "linear-gradient(to top, #7c4dff, var(--skin-accent, #d0bcff))" : skinId === "studio" ? "linear-gradient(to top, #008ba3, #00e5ff)" : skinId === "minimal" ? "#ffffff" : "linear-gradient(to top, #F59E0B, #FBBF24)";
          const barRadius = skinId === "studio" ? 4 : skinId === "theater" ? 6 : "var(--skin-hud-radius, 22px)";

          return (
            <motion.div
              key="brightness-bar"
              initial={{ opacity: 0, x: -28, y: "-50%" }}
              animate={{ opacity: 1, x: 0, y: "-50%" }}
              exit={{ opacity: 0, x: -24, y: "-50%" }}
              transition={SPRING_SNAPPY}
              style={{
                position: 'absolute',
                left: 'calc(clamp(14px, 3.5vw, 28px) + var(--sal))',
                top: '50%',
                width: 44,
                height: 'clamp(170px, 42vh, 230px)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0 10px',
                zIndex: 65, pointerEvents: 'none',
                background: 'var(--skin-hud-bg, rgba(18,18,22,0.84))',
                backdropFilter: 'blur(var(--skin-hud-blur, 30px)) saturate(190%)',
                WebkitBackdropFilter: 'blur(var(--skin-hud-blur, 30px)) saturate(190%)',
                borderRadius: barRadius,
                border: 'var(--skin-hud-border, 1px solid rgba(255,255,255,0.12))',
                boxShadow: 'var(--skin-hud-shadow, 0 20px 48px rgba(0,0,0,0.7))',
                overflow: 'hidden',
                fontFamily: 'var(--skin-hud-font, inherit)',
              }}>
              {/* Sun icon at top with glow */}
              <motion.div
                animate={{ scale: [0.95, 1.05, 1] }}
                transition={{ duration: 0.3 }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={sunColor} strokeWidth="2.2" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${sunColor})` }}>
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                </svg>
              </motion.div>
              {/* Track */}
              <div style={{
                position: 'relative', width: 6, flex: 1, margin: '10px 0',
                background: 'rgba(255,255,255,0.12)', borderRadius: skinId === 'studio' ? 1 : 3,
                overflow: 'hidden',
              }}>
                {/* Fill */}
                <motion.div
                  animate={{ height: `${Math.max(0, Math.min(100, Math.round(gestureValue * 100)))}%` }}
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: trackGradient,
                    borderRadius: skinId === 'studio' ? 1 : 3,
                    boxShadow: `0 0 10px ${sunColor}`,
                  }}
                />
              </div>
              {/* Percentage */}
              <span style={{
                color: sunColor, fontSize: 11, fontWeight: 800,
                fontFamily: "var(--skin-hud-font, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif)",
                fontVariantNumeric: 'tabular-nums', letterSpacing: skinId === 'studio' ? '0.04em' : '-0.02em',
                textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              }}>
                {Math.max(0, Math.min(100, Math.round(gestureValue * 100)))}%
              </span>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Volume vertical bar — right edge */}
      <AnimatePresence>
        {gestureType === 'volume' && isTouch && (() => {
          const skinId = skin?.id || "classic";
          const isZero = isMuted || volume === 0;
          const volColor = isZero ? "#ff453a" : skinId === "theater" ? "#ffd166" : skinId === "material" ? "var(--skin-accent, #d0bcff)" : skinId === "studio" ? "#00e5ff" : "#fff";
          const trackGradient = isZero ? "#ff453a" : skinId === "theater" ? "linear-gradient(to top, #b8860b, #ffd166)" : skinId === "material" ? "linear-gradient(to top, #7c4dff, var(--skin-accent, #d0bcff))" : skinId === "studio" ? "linear-gradient(to top, #008ba3, #00e5ff)" : skinId === "minimal" ? "#ffffff" : "linear-gradient(to top, rgba(255,255,255,0.8), #fff)";
          const barRadius = skinId === "studio" ? 4 : skinId === "theater" ? 6 : "var(--skin-hud-radius, 22px)";

          return (
            <motion.div
              key="volume-bar"
              initial={{ opacity: 0, x: 28, y: "-50%" }}
              animate={{ opacity: 1, x: 0, y: "-50%" }}
              exit={{ opacity: 0, x: 24, y: "-50%" }}
              transition={SPRING_SNAPPY}
              style={{
                position: 'absolute',
                right: 'calc(clamp(14px, 3.5vw, 28px) + var(--sar))',
                top: '50%',
                width: 44,
                height: 'clamp(170px, 42vh, 230px)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0 10px',
                zIndex: 65, pointerEvents: 'none',
                background: 'var(--skin-hud-bg, rgba(18,18,22,0.84))',
                backdropFilter: 'blur(var(--skin-hud-blur, 30px)) saturate(190%)',
                WebkitBackdropFilter: 'blur(var(--skin-hud-blur, 30px)) saturate(190%)',
                borderRadius: barRadius,
                border: 'var(--skin-hud-border, 1px solid rgba(255,255,255,0.12))',
                boxShadow: 'var(--skin-hud-shadow, 0 20px 48px rgba(0,0,0,0.7))',
                overflow: 'hidden',
                fontFamily: 'var(--skin-hud-font, inherit)',
              }}>
              {/* Speaker icon at top */}
              <motion.div
                key={isMuted || volume === 0 ? 'off' : 'on'}
                initial={{ scale: 0.6 }} animate={{ scale: 1 }}
                transition={SPRING_FAST}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {isZero ? (
                  <VolumeX size={18} color="#ff453a" strokeWidth={2.2} style={{ filter: 'drop-shadow(0 0 6px rgba(255,69,58,0.6))' }} />
                ) : (
                  <Volume2 size={18} color={volColor} strokeWidth={2.2} style={{ filter: `drop-shadow(0 0 6px ${volColor})` }} />
                )}
              </motion.div>
              {/* Track */}
              <div style={{
                position: 'relative', width: 6, flex: 1, margin: '10px 0',
                background: 'rgba(255,255,255,0.12)', borderRadius: skinId === 'studio' ? 1 : 3,
                overflow: 'hidden',
              }}>
                <motion.div
                  animate={{ height: `${Math.max(0, Math.min(100, Math.round((isMuted ? 0 : volume) * 100)))}%` }}
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: trackGradient,
                    borderRadius: skinId === 'studio' ? 1 : 3,
                    boxShadow: isZero ? '0 0 10px rgba(255,69,58,0.5)' : `0 0 10px ${volColor}`,
                  }}
                />
              </div>
              {/* Percentage */}
              <span style={{
                color: volColor,
                fontSize: 11, fontWeight: 800,
                fontFamily: "var(--skin-hud-font, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif)",
                fontVariantNumeric: 'tabular-nums', letterSpacing: skinId === 'studio' ? '0.04em' : '-0.02em',
                textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              }}>
                {Math.max(0, Math.min(100, Math.round((isMuted ? 0 : volume) * 100)))}%
              </span>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Seek indicator — center (Framer Motion x/y: -50% ensures perfect viewport centering) */}
      <AnimatePresence>
        {gestureType === 'seek' && isTouch && (() => {
          const skinId = skin?.id || "classic";
          const accentColor = skinId === "theater" ? "#ffd166" : skinId === "material" ? "var(--skin-accent, #d0bcff)" : skinId === "studio" ? "#00e5ff" : skinId === "minimal" ? "#ffffff" : "#7DD3FC";
          const barRadius = skinId === "studio" ? 4 : skinId === "theater" ? 6 : "var(--skin-hud-radius, 20px)";

          return (
            <motion.div
              key="seek-indicator"
              initial={{ opacity: 0, scale: 0.85, x: "-50%", y: "-50%" }}
              animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
              exit={{ opacity: 0, scale: 0.9, x: "-50%", y: "-50%" }}
              transition={SPRING_SNAPPY}
              style={{
                position: 'absolute', top: '50%', left: '50%',
                zIndex: 65, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                background: 'var(--skin-hud-bg, rgba(18,18,22,0.88))',
                backdropFilter: 'blur(var(--skin-hud-blur, 32px)) saturate(190%)',
                WebkitBackdropFilter: 'blur(var(--skin-hud-blur, 32px)) saturate(190%)',
                borderRadius: barRadius, padding: '14px 24px', minWidth: 160,
                border: 'var(--skin-hud-border, 1px solid rgba(255,255,255,0.12))',
                boxShadow: 'var(--skin-hud-shadow, 0 24px 60px rgba(0,0,0,0.8))',
                fontFamily: 'var(--skin-hud-font, inherit)',
              }}>
              {/* Seek direction & delta */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {seekDelta > 0 ? (
                  <FastForward size={20} color={accentColor} strokeWidth={2.4} style={{ filter: `drop-shadow(0 0 8px ${accentColor})` }} />
                ) : (
                  <Rewind size={20} color={accentColor} strokeWidth={2.4} style={{ filter: `drop-shadow(0 0 8px ${accentColor})` }} />
                )}
                <span style={{
                  color: '#fff', fontSize: 20, fontWeight: 800,
                  fontFamily: "var(--skin-hud-font, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif)",
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                }}>
                  {seekDelta > 0 ? '+' : ''}{Math.round(seekDelta)}s
                </span>
              </div>
              {/* Destination time display */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12, fontWeight: 600,
                fontFamily: skinId === "studio" ? "var(--skin-hud-font, monospace)" : "SF Mono, Menlo, monospace", fontVariantNumeric: 'tabular-nums',
              }}>
                <span style={{ color: accentColor }}>{fmt(Math.max(0, Math.min(currentTime + seekDelta, duration || 0)))}</span>
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>/</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{fmt(duration)}</span>
              </div>
              {/* Mini destination progress bar */}
              {duration > 0 && (
                <div style={{
                  width: 120, height: 3, background: 'rgba(255,255,255,0.12)',
                  borderRadius: skinId === 'studio' ? 1 : 2, overflow: 'hidden', marginTop: 2, position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${Math.max(0, Math.min(((currentTime + seekDelta) / duration) * 100, 100))}%`,
                    background: accentColor, borderRadius: skinId === 'studio' ? 1 : 2,
                    boxShadow: `0 0 6px ${accentColor}`,
                  }} />
                </div>
              )}
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ═══ SHORTCUTS OVERLAY ═══════════════════════════════════ */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowShortcuts(false)}
            style={{
              position: "absolute", inset: 0, zIndex: 70,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={SPRING}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "var(--skin-panel-bg, rgba(18,18,20,0.95))",
                border: "var(--skin-panel-border, 1px solid rgba(255,255,255,0.06))",
                borderRadius: R.radiusMedium, padding: `${R.padLarge} clamp(16px, 3vw, 26px)`, width: isTouch ? "min(92vw, 360px)" : R.panelShortcuts,
                color: "#fff", boxShadow: "0 40px 80px rgba(0,0,0,0.8)",
                backdropFilter: "blur(var(--skin-panel-blur, 40px))", WebkitBackdropFilter: "blur(var(--skin-panel-blur, 40px))",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <span style={{
                  fontWeight: 700, fontSize: R.fontLarge,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                }}>{isTouch ? "Touch Gestures" : "Shortcuts"}</span>
                <button onClick={() => setShowShortcuts(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", display: "flex", padding: 6 }}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(isTouch ? TOUCH_GESTURES : KEYBOARD_SHORTCUTS).map((item) => (
                  <div key={item.key || item.gesture} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <span style={{
                      color: "rgba(255,255,255,0.6)", fontSize: R.fontMedium,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}>{item.action}</span>
                    <span style={{
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                      padding: isTouch ? "4px 10px" : "3px 10px", borderRadius: 6,
                      fontFamily: isTouch ? "-apple-system, BlinkMacSystemFont, sans-serif" : "SF Mono, Menlo, monospace",
                      fontWeight: 700, fontSize: R.fontTiny, color: "rgba(255,255,255,0.85)",
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {item.key || item.gesture}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SEEK INDICATORS — Circular arc motif ════════════════ */}
      <div style={{ position: "absolute", inset: 0, zIndex: 12, pointerEvents: "none", display: "flex", alignItems: "center" }}>
        {/* Left — rewind */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "30%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AnimatePresence>
            {sideIcon?.type === "backward" && (
              isTouch ? (
                <motion.div
                  key="bwd-touch"
                  initial={{ opacity: 0, scale: 0.7, x: -14 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.85, x: -8 }}
                  transition={SPRING_SNAPPY}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                    borderRadius: 9999,
                    background: "rgba(18, 18, 24, 0.84)",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    boxShadow: "0 10px 32px rgba(0,0,0,0.65), 0 0 16px rgba(0, 229, 255, 0.15)",
                    marginLeft: "var(--sal, 0px)",
                  }}
                >
                  <motion.div
                    animate={{ x: [0, -3, 0] }}
                    transition={{ repeat: 2, duration: 0.25 }}
                  >
                    <Rewind size={18} color="#00e5ff" strokeWidth={2.5} />
                  </motion.div>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                    letterSpacing: "0.2px",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {sideIcon.text}
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  key="bwd"
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.4 }}
                  transition={SPRING_SNAPPY}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                >
                  <div style={{ position: "relative" }}>
                    <motion.div
                      initial={{ rotate: 0 }}
                      animate={{ rotate: [0, -360] }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <ArcRing
                        progress={0.4}
                        size={64} responsive="clamp(48px, 8vw, 68px)" strokeWidth={2.5}
                        color="rgba(255,255,255,0.8)"
                        bgColor="rgba(255,255,255,0.04)"
                        glowColor="rgba(255,255,255,0.12)"
                      >
                        <motion.div
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.1, ...SPRING_SNAPPY }}
                        >
                          <Rewind size={22} color="#fff" strokeWidth={2} />
                        </motion.div>
                      </ArcRing>
                    </motion.div>
                  </div>
                  <motion.span
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, ...SPRING_FAST }}
                    style={{
                      fontSize: R.fontMedium, fontWeight: 700, color: "#fff",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                      textShadow: "0 1px 12px rgba(0,0,0,0.9)",
                      fontVariantNumeric: "tabular-nums",
                    }}>{sideIcon.text}</motion.span>
                </motion.div>
              )
            )}
          </AnimatePresence>
        </div>
        {/* Right — forward */}
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "30%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AnimatePresence>
            {sideIcon?.type === "forward" && (
              isTouch ? (
                <motion.div
                  key="fwd-touch"
                  initial={{ opacity: 0, scale: 0.7, x: 14 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.85, x: 8 }}
                  transition={SPRING_SNAPPY}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                    borderRadius: 9999,
                    background: "rgba(18, 18, 24, 0.84)",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    boxShadow: "0 10px 32px rgba(0,0,0,0.65), 0 0 16px rgba(0, 229, 255, 0.15)",
                    marginRight: "var(--sar, 0px)",
                  }}
                >
                  <span style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                    letterSpacing: "0.2px",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {sideIcon.text}
                  </span>
                  <motion.div
                    animate={{ x: [0, 3, 0] }}
                    transition={{ repeat: 2, duration: 0.25 }}
                  >
                    <FastForward size={18} color="#00e5ff" strokeWidth={2.5} />
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="fwd"
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.4 }}
                  transition={SPRING_SNAPPY}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                >
                  <div style={{ position: "relative" }}>
                    <motion.div
                      initial={{ rotate: 0 }}
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <ArcRing
                        progress={0.4}
                        size={64} responsive="clamp(48px, 8vw, 68px)" strokeWidth={2.5}
                        color="rgba(255,255,255,0.8)"
                        bgColor="rgba(255,255,255,0.04)"
                        glowColor="rgba(255,255,255,0.12)"
                      >
                        <motion.div
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.1, ...SPRING_SNAPPY }}
                        >
                          <FastForward size={22} color="#fff" strokeWidth={2} />
                        </motion.div>
                      </ArcRing>
                    </motion.div>
                  </div>
                  <motion.span
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, ...SPRING_FAST }}
                    style={{
                      fontSize: R.fontMedium, fontWeight: 700, color: "#fff",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                      textShadow: "0 1px 12px rgba(0,0,0,0.9)",
                      fontVariantNumeric: "tabular-nums",
                    }}>{sideIcon.text}</motion.span>
                </motion.div>
              )
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Double-tap ripple */}
      <div style={{ position: "absolute", inset: 0, zIndex: 11, pointerEvents: "none" }}>
        <AnimatePresence>
          {doubleTapRipple && (
            <motion.div
              key={doubleTapRipple.id}
              initial={{ opacity: isTouch ? 0.3 : 0.4 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.45 }}
              style={{
                position: "absolute",
                [doubleTapRipple.side]: 0,
                width: isTouch ? "35%" : "40%", height: "100%",
                background: isTouch
                  ? `radial-gradient(ellipse at ${doubleTapRipple.side === "left" ? "0%" : "100%"} center, rgba(0,229,255,0.16) 0%, rgba(255,255,255,0.05) 40%, transparent 75%)`
                  : `radial-gradient(ellipse at ${doubleTapRipple.side} center, rgba(255,255,255,0.04) 0%, transparent 70%)`,
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Screen Lock Button & Unlock HUD */}
      {isTouch && showCustomUI && ctrl.screenLock && (
        <AnimatePresence>
          {isScreenLocked ? (
            <motion.button
              key="unlock-btn"
              initial={{ opacity: 0, scale: 0.8, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -6 }}
              whileTap={{ scale: 0.92 }}
              onClick={(e) => {
                e.stopPropagation();
                setIsScreenLocked(false);
                setToastMessage("Controls Unlocked");
                if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
              }}
              style={{
                position: "absolute",
                top: "calc(14px + var(--sat))",
                left: "calc(14px + var(--sal))",
                zIndex: 75,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 18px",
                borderRadius: 999,
                background: "rgba(18, 18, 24, 0.90)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(251, 191, 36, 0.4)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                boxShadow: "0 8px 30px rgba(0,0,0,0.6), 0 0 16px rgba(251, 191, 36, 0.2)",
                cursor: "pointer",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              }}
            >
              <Lock size={15} color="#FBBF24" /> Tap to Unlock
            </motion.button>
          ) : controlsVisible && uiLayout.screenLock === "topLeft" && (
            <motion.button
              key="lock-btn"
              initial={{ opacity: 0, scale: 0.8, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -6 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                setIsScreenLocked(true);
                setShowControls(false);
                setToastMessage("Controls Locked");
                if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
              }}
              aria-label="Lock screen controls"
              style={{
                position: "absolute",
                top: "calc(14px + var(--sat))",
                left: "calc(14px + var(--sal))",
                zIndex: 65,
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "rgba(18, 18, 24, 0.78)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                color: "rgba(255, 255, 255, 0.9)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
                cursor: "pointer",
              }}
            >
              <Unlock size={17} />
            </motion.button>
          )}
        </AnimatePresence>
      )}

      {/* ═══ TOP HEADER / ZONES per preset archetype ═══ */}
      {showCustomUI && controlsVisible && !isScreenLocked && (
        playerUIPreset === "theater" ? (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="player-preset-theater-header"
            style={{
              position: "absolute",
              top: "calc(clamp(10px, 2.5vw, 24px) + var(--sat))",
              left: "calc(14px + var(--sal))",
              right: "calc(14px + var(--sar))",
              zIndex: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "linear-gradient(180deg, rgba(20,14,4,0.9), transparent)",
              padding: "10px 16px",
              borderRadius: 12,
              border: "1px solid rgba(255,209,102,0.25)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
              <span style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: "clamp(14px, 2vw, 22px)",
                color: "#ffd166",
                fontWeight: 700,
                fontStyle: "italic",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}>
                {movie?.title || movie?.name}
              </span>
              <span style={{ color: "#ffd166", fontSize: 10, fontWeight: 800, padding: "2px 6px", border: "1px solid rgba(255,209,102,0.4)", borderRadius: 4, flexShrink: 0 }}>★ 4K IMAX</span>
              <span style={{ color: "#ffd166", fontSize: 10, fontWeight: 800, padding: "2px 6px", border: "1px solid rgba(255,209,102,0.4)", borderRadius: 4, flexShrink: 0 }}>DOLBY ATMOS</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {topZoneKeys("topLeft").map((key) => (
                <React.Fragment key={key}>{barControl(key, "icon")}</React.Fragment>
              ))}
              {topZoneKeys("topRight").map((key) => (
                <React.Fragment key={key}>{barControl(key, "icon")}</React.Fragment>
              ))}
            </div>
          </motion.div>
        ) : playerUIPreset === "studio" ? (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: "absolute",
              top: "calc(clamp(8px, 2vw, 18px) + var(--sat))",
              left: "calc(12px + var(--sal))",
              right: "calc(12px + var(--sar))",
              zIndex: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(10, 10, 14, 0.92)",
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.12)",
              fontFamily: "monospace",
              fontSize: "clamp(10px, 1.2vw, 12px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ color: "#ff3b4e", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff3b4e", boxShadow: "0 0 8px #ff3b4e" }} />
                REC / LIVE
              </span>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
              <span style={{ color: "#ff3b4e", fontWeight: 700 }}>TC {formatSMPTE(currentTime)}</span>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
              <span style={{ color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                {movie?.title || movie?.name}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>SRV-{activeServerIndex + 1}</span>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>1080P 24FPS</span>
              {topZoneKeys("topLeft").map((key) => (
                <React.Fragment key={key}>{barControl(key, "icon")}</React.Fragment>
              ))}
              {topZoneKeys("topRight").map((key) => (
                <React.Fragment key={key}>{barControl(key, "icon")}</React.Fragment>
              ))}
            </div>
          </motion.div>
        ) : (
          /* Classic / Apple / Material / Minimal Top zones */
          (topZoneKeys("topLeft").length > 0 || topZoneKeys("topRight").length > 0) && (
            <motion.div
              initial={entranceVariants.hud.initial}
              animate={entranceVariants.hud.animate}
              transition={entranceVariants.hud.transition}
              style={{
                position: "absolute",
                top: "calc(clamp(52px, 10vw, 76px) + var(--sat))",
                left: "calc(14px + var(--sal))",
                right: "calc(14px + var(--sar))",
                zIndex: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                pointerEvents: "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, pointerEvents: "auto" }}>
                {topZoneKeys("topLeft").map((key) => (
                  <React.Fragment key={key}>{barControl(key, "icon")}</React.Fragment>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, pointerEvents: "auto" }}>
                {topZoneKeys("topRight").map((key) => (
                  <React.Fragment key={key}>{barControl(key, "icon")}</React.Fragment>
                ))}
              </div>
            </motion.div>
          )
        )
      )}

      {/* ═══ CENTER SCREEN PLAYBACK CLUSTER (Theater) ═══ */}
      {showCustomUI && controlsVisible && !isScreenLocked && playerUIPreset === "theater" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={SPRING}
          className="player-preset-theater-amber-cluster"
        >
          {ctrl.jumpForwardBackward && (
            <motion.button
              onClick={(e) => { e.stopPropagation(); seekRelative(-10); }}
              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              style={{ width: 60, height: 60, borderRadius: "50%", background: "none", border: "2px solid #ffd166", color: "#ffd166", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <RotateCcw size={24} />
            </motion.button>
          )}
          <motion.button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            style={{ width: 96, height: 96, borderRadius: "50%", background: "transparent", border: "none", color: "#ffd166", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 0 0 16px rgba(255,209,102,0.08), 0 0 0 32px rgba(255,178,64,0.04), 0 0 60px rgba(255,150,0,0.5)" }}
          >
            {isPlaying ? <Pause size={40} fill="currentColor" /> : <Play size={40} fill="currentColor" style={{ marginLeft: 6 }} />}
          </motion.button>
          {ctrl.jumpForwardBackward && (
            <motion.button
              onClick={(e) => { e.stopPropagation(); seekRelative(10); }}
              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              style={{ width: 60, height: 60, borderRadius: "50%", background: "none", border: "2px solid #ffd166", color: "#ffd166", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <RotateCw size={24} />
            </motion.button>
          )}
        </motion.div>
      )}

      {/* ═══ BOTTOM CONTROLS per preset archetype ═══ */}
      <AnimatePresence>
        {showCustomUI && controlsVisible && (
          <motion.div
            initial={entranceVariants.bar.initial}
            animate={entranceVariants.bar.animate}
            exit={entranceVariants.bar.exit}
            transition={entranceVariants.bar.transition}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20, pointerEvents: "none", paddingBottom: "var(--sab)" }}
          >
            {/* Skip Intro / Up Next */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-end",
              padding: `0 ${R.progressBarPad}`, marginBottom: 8, pointerEvents: "none",
              marginLeft: "var(--sal, 0px)", marginRight: "var(--sar, 0px)",
            }}>
              <div style={{ pointerEvents: "auto" }}>
                <AnimatePresence>
                  {showSkipIntro && skipIntroTime != null && (
                    <motion.button
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      transition={SPRING}
                      onClick={(e) => { e.stopPropagation(); sendCommand("seek", [skipIntroTime]); setShowSkipIntro(false); }}
                      style={{
                        background: "var(--accent-gradient, rgba(28,28,30,0.7))", color: "var(--on-accent, #fff)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        padding: isTouch ? "9px 18px" : `${R.padMedium} ${R.padMedium}`,
                        minHeight: isTouch ? 42 : "auto",
                        borderRadius: "var(--skin-hud-radius, 100px)", cursor: "pointer",
                        fontWeight: 700, backdropFilter: "blur(var(--skin-hud-blur, 24px))",
                        WebkitBackdropFilter: "blur(var(--skin-hud-blur, 24px))",
                        boxShadow: "0 8px 24px var(--accent-glow, rgba(0,0,0,0.4))",
                        display: "flex", alignItems: "center", gap: "clamp(4px, 1vw, 6px)", fontSize: R.fontMedium,
                        fontFamily: "var(--skin-hud-font, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif)",
                      }}
                    >
                      <FastForward size={13} fill="currentColor" color="currentColor" /> Skip Intro
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "clamp(4px, 1vw, 6px)", pointerEvents: "auto" }}>
                <AnimatePresence>
                  {showUpNext && hasNextEpisode && (
                    <motion.div
                      initial={{ opacity: 0, x: 14 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={SPRING}
                      style={{
                        background: "var(--skin-badge-bg, rgba(28,28,30,0.7))", border: "var(--skin-hud-border, 1px solid rgba(255,255,255,0.06))",
                        borderRadius: 12, padding: `${R.padMedium} ${R.padSmall}`,
                        display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)",
                        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.35)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>Up Next</div>
                        <div style={{ fontSize: R.fontMedium, color: "#fff", fontWeight: 700, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>Ep {(episode || 0) + 1}</div>
                      </div>
                      <ArcRing progress={upNextCountdown / 15} size={32} strokeWidth={2} color="var(--accent-primary, rgba(255,255,255,0.8))" bgColor="rgba(255,255,255,0.06)">
                        <span style={{ fontSize: R.fontTiny, fontWeight: 800, color: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>{upNextCountdown}</span>
                      </ArcRing>
                      <button onClick={(e) => { e.stopPropagation(); dismissUpNext(); }}
                        style={{
                          background: "rgba(255,255,255,0.04)", border: "none", color: "rgba(255,255,255,0.4)",
                          cursor: "pointer", width: 22, height: 22, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <X size={10} />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
                {hasNextEpisode && (
                  <button onClick={(e) => { e.stopPropagation(); onNextEpisode?.(); }}
                    style={{
                      background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.08)",
                      padding: `${R.padSmall} ${R.padMedium}`, borderRadius: 100, cursor: "pointer",
                      fontWeight: 700, display: "flex", alignItems: "center", gap: "clamp(3px, 0.8vw, 5px)", fontSize: R.fontSmall,
                      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}
                  >
                    Next <SkipForward size={12} fill="currentColor" />
                  </button>
                )}
              </div>
            </div>

            {/* ═══ ARCHETYPE BOTTOM BAR SWITCHER ═══ */}
            {playerUIPreset === "minimal" ? (
              <div style={{ margin: isTouch ? "0 8px 6px" : "0 16px 10px", pointerEvents: "auto" }}>
                {/* Hairline Progress Bar */}
                <div
                  ref={progressBarRef}
                  onMouseDown={onProgressMouseDown}
                  onMouseMove={handleProgressHover}
                  onMouseLeave={() => setHoverTime(null)}
                  onTouchStart={(e) => { e.stopPropagation(); setIsScrubbing(true); handleProgressScrub({ clientX: e.touches[0].clientX }); }}
                  onTouchMove={(e) => { e.stopPropagation(); handleProgressScrub({ clientX: e.touches[0].clientX }); }}
                  onTouchEnd={(e) => { e.stopPropagation(); setIsScrubbing(false); }}
                  style={{
                    position: "relative",
                    height: hoverTime != null || isScrubbing ? (isTouch ? 6 : 4) : 2,
                    background: "rgba(255,255,255,0.15)",
                    cursor: "pointer",
                    touchAction: "none",
                    borderRadius: 2,
                    marginBottom: 8,
                    transition: "height 0.15s ease",
                  }}
                >
                  <div
                    ref={progressTrackRef}
                    style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${(currentTime / (duration || 1)) * 100}%`,
                      background: "#fff",
                      borderRadius: 2,
                    }}
                  />
                </div>

                {/* Minimal Control Row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {zoneKeys("bottomLeft").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, fontFamily: "monospace", marginLeft: 4 }}>
                      {fmt(currentTime)} / {fmt(duration)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {zoneKeys("bottomCenter").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {zoneKeys("bottomRight").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ) : playerUIPreset === "apple" ? (
              <div
                style={{
                  margin: isTouch ? "0 8px 10px" : "0 24px 18px",
                  background: "rgba(24, 24, 30, 0.76)",
                  backdropFilter: "blur(32px) saturate(180%)",
                  WebkitBackdropFilter: "blur(32px) saturate(180%)",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                  borderRadius: isTouch ? 24 : 32,
                  boxShadow: "0 16px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
                  padding: isTouch ? "10px 12px 10px" : "12px 18px 12px",
                  pointerEvents: "auto",
                }}
              >
                {/* Apple Capsule Scrubber */}
                <div
                  ref={progressBarRef}
                  onMouseDown={onProgressMouseDown}
                  onMouseMove={handleProgressHover}
                  onMouseLeave={() => setHoverTime(null)}
                  onTouchStart={(e) => { e.stopPropagation(); setIsScrubbing(true); handleProgressScrub({ clientX: e.touches[0].clientX }); }}
                  onTouchMove={(e) => { e.stopPropagation(); handleProgressScrub({ clientX: e.touches[0].clientX }); }}
                  onTouchEnd={(e) => { e.stopPropagation(); setIsScrubbing(false); }}
                  style={{
                    position: "relative",
                    height: isTouch ? 8 : 6,
                    background: "rgba(255,255,255,0.14)",
                    borderRadius: 999,
                    cursor: "pointer",
                    touchAction: "none",
                    marginBottom: 10,
                  }}
                >
                  <div
                    ref={progressTrackRef}
                    style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${(currentTime / (duration || 1)) * 100}%`,
                      background: "linear-gradient(90deg, #ffffff, rgba(255,255,255,0.85))",
                      borderRadius: 999,
                      boxShadow: "0 0 10px rgba(255,255,255,0.4)",
                    }}
                  />
                </div>

                {/* Apple Controls Row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {zoneKeys("bottomLeft").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, fontFamily: "-apple-system, 'SF Pro Text', sans-serif", marginLeft: 4 }}>
                      {fmt(currentTime)} <span style={{ opacity: 0.4 }}>/</span> {fmt(duration)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {zoneKeys("bottomCenter").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {zoneKeys("bottomRight").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ) : (playerUIPreset === "material" || playerUIPreset === "compact") ? (
              <div
                style={{
                  margin: isTouch ? "0 8px 10px" : "0 20px 16px",
                  background: "rgba(28, 27, 31, 0.94)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 24,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
                  padding: isTouch ? "10px 14px 12px" : "12px 18px 14px",
                  pointerEvents: "auto",
                }}
              >
                {/* Material 3 Pill Scrubber */}
                <div
                  ref={progressBarRef}
                  onMouseDown={onProgressMouseDown}
                  onMouseMove={handleProgressHover}
                  onMouseLeave={() => setHoverTime(null)}
                  onTouchStart={(e) => { e.stopPropagation(); setIsScrubbing(true); handleProgressScrub({ clientX: e.touches[0].clientX }); }}
                  onTouchMove={(e) => { e.stopPropagation(); handleProgressScrub({ clientX: e.touches[0].clientX }); }}
                  onTouchEnd={(e) => { e.stopPropagation(); setIsScrubbing(false); }}
                  style={{
                    position: "relative",
                    height: 6,
                    background: "rgba(230, 225, 229, 0.16)",
                    borderRadius: 999,
                    cursor: "pointer",
                    touchAction: "none",
                    marginBottom: 10,
                  }}
                >
                  <div
                    ref={progressTrackRef}
                    style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${(currentTime / (duration || 1)) * 100}%`,
                      background: "#d0bcff",
                      borderRadius: 999,
                      boxShadow: "0 0 10px rgba(208, 188, 255, 0.6)",
                    }}
                  />
                </div>

                {/* Material Controls Row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {zoneKeys("bottomLeft").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                    <span style={{ color: "#cac4d0", fontSize: 12, fontWeight: 600, marginLeft: 4 }}>
                      {fmt(currentTime)} / {fmt(duration)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {zoneKeys("bottomCenter").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {zoneKeys("bottomRight").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ) : playerUIPreset === "theater" ? (
              <div
                style={{
                  background: "linear-gradient(to top, rgba(14, 9, 2, 0.96), rgba(14, 9, 2, 0.7) 70%, transparent)",
                  padding: isTouch ? "8px 12px 14px" : "12px 24px 20px",
                  pointerEvents: "auto",
                }}
              >
                {/* Theater Gold Scrubber */}
                <div
                  ref={progressBarRef}
                  onMouseDown={onProgressMouseDown}
                  onMouseMove={handleProgressHover}
                  onMouseLeave={() => setHoverTime(null)}
                  onTouchStart={(e) => { e.stopPropagation(); setIsScrubbing(true); handleProgressScrub({ clientX: e.touches[0].clientX }); }}
                  onTouchMove={(e) => { e.stopPropagation(); handleProgressScrub({ clientX: e.touches[0].clientX }); }}
                  onTouchEnd={(e) => { e.stopPropagation(); setIsScrubbing(false); }}
                  style={{
                    position: "relative",
                    height: 6,
                    background: "rgba(255,209,102,0.18)",
                    borderRadius: 3,
                    cursor: "pointer",
                    touchAction: "none",
                    marginBottom: 10,
                  }}
                >
                  <div
                    ref={progressTrackRef}
                    style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${(currentTime / (duration || 1)) * 100}%`,
                      background: "#ffd166",
                      borderRadius: 3,
                      boxShadow: "0 0 14px rgba(255,209,102,0.9)",
                    }}
                  />
                </div>

                {/* Countdown / Meta Row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 4px" }}>
                  <div style={{ fontFamily: "Georgia, serif", fontSize: 13, color: "#ffd166", fontWeight: 700 }}>
                    {fmt(currentTime)} <span style={{ opacity: 0.5 }}>/</span> {fmt(duration)}
                  </div>
                  <div style={{ fontFamily: "Georgia, serif", fontSize: 13, color: "#ffd166", fontStyle: "italic", opacity: 0.85 }}>
                    {Math.max(0, Math.floor((duration - currentTime) / 60))} min remaining
                  </div>
                </div>

                {/* Controls Row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {zoneKeys("bottomLeft").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {zoneKeys("bottomCenter").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {zoneKeys("bottomRight").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ) : playerUIPreset === "studio" ? (
              <div
                style={{
                  background: "rgba(10, 10, 14, 0.96)",
                  borderTop: "1px solid rgba(255,255,255,0.12)",
                  padding: isTouch ? "6px 8px 12px" : "8px 16px 16px",
                  fontFamily: "monospace",
                  pointerEvents: "auto",
                }}
              >
                {/* Studio Ruler Scrubber */}
                <div
                  ref={progressBarRef}
                  onMouseDown={onProgressMouseDown}
                  onMouseMove={handleProgressHover}
                  onMouseLeave={() => setHoverTime(null)}
                  onTouchStart={(e) => { e.stopPropagation(); setIsScrubbing(true); handleProgressScrub({ clientX: e.touches[0].clientX }); }}
                  onTouchMove={(e) => { e.stopPropagation(); handleProgressScrub({ clientX: e.touches[0].clientX }); }}
                  onTouchEnd={(e) => { e.stopPropagation(); setIsScrubbing(false); }}
                  style={{
                    position: "relative",
                    height: 18,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 3,
                    cursor: "pointer",
                    touchAction: "none",
                    marginBottom: 8,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ position: "absolute", top: 2, left: "25%", fontSize: 7, color: "rgba(255,255,255,0.3)" }}>▼</div>
                  <div style={{ position: "absolute", top: 2, left: "50%", fontSize: 7, color: "rgba(255,255,255,0.3)" }}>▼</div>
                  <div style={{ position: "absolute", top: 2, left: "75%", fontSize: 7, color: "rgba(255,255,255,0.3)" }}>▼</div>
                  <div
                    ref={progressTrackRef}
                    style={{
                      position: "absolute", left: 0, bottom: 0, height: 5,
                      width: `${(currentTime / (duration || 1)) * 100}%`,
                      background: "linear-gradient(90deg, #e63946, #ff6b6b)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute", left: `${(currentTime / (duration || 1)) * 100}%`, top: 0, bottom: 0,
                      width: 2, background: "#ff3b4e", transform: "translateX(-50%)",
                    }}
                  />
                </div>

                {/* Frame Jog + VU Meter + Transport bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <button onClick={(e) => { e.stopPropagation(); sendCommand("seek", [0]); }} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", padding: "3px 6px", cursor: "pointer", fontSize: 9, borderRadius: 3 }}>|◀◀</button>
                    <button onClick={(e) => { e.stopPropagation(); sendCommand("seek", [Math.max(0, currentTime - 0.0416)]); }} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", padding: "3px 6px", cursor: "pointer", display: "flex", alignItems: "center", fontSize: 9, borderRadius: 3 }}><StepBack size={10} style={{ marginRight: 2 }}/>⏮</button>
                    <button onClick={(e) => { e.stopPropagation(); sendCommand("seek", [Math.min(duration || 0, currentTime + 0.0416)]); }} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", padding: "3px 6px", cursor: "pointer", display: "flex", alignItems: "center", fontSize: 9, borderRadius: 3 }}>⏭<StepForward size={10} style={{ marginLeft: 2 }}/></button>
                    <button onClick={(e) => { e.stopPropagation(); sendCommand("seek", [duration]); }} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", padding: "3px 6px", cursor: "pointer", fontSize: 9, borderRadius: 3 }}>▶▶|</button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ display: "flex", gap: 2, height: 12, alignItems: "flex-end", marginRight: 6 }}>
                      {[8, 12, 6, 10, 5].map((h, i) => (
                        <div key={i} style={{ width: 3, height: isPlaying ? h : 2, background: i > 3 ? "#ff3b4e" : i > 2 ? "#ffd166" : "#4ade80", borderRadius: 1 }} />
                      ))}
                    </div>
                    {[0.5, 1, 1.5, 2].map((spd) => (
                      <button key={spd} onClick={(e) => { e.stopPropagation(); setPlaybackRate(spd); sendCommand("playbackRate", [spd]); }} style={{ background: playbackRate === spd ? "rgba(255,59,78,0.2)" : "none", border: playbackRate === spd ? "1px solid #ff3b4e" : "1px solid transparent", color: playbackRate === spd ? "#ff3b4e" : "rgba(255,255,255,0.5)", fontSize: 9, padding: "2px 4px", borderRadius: 3, cursor: "pointer" }}>
                        [{spd}x]
                      </button>
                    ))}
                  </div>
                </div>

                {/* Studio Controls Zone Row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    {zoneKeys("bottomLeft").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    {zoneKeys("bottomCenter").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    {zoneKeys("bottomRight").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Classic / Custom: Traditional streaming player bottom stack */
              <div>
                {/* ═══ PROGRESS BAR ═══════════════════════════════════ */}
                <div
                  ref={progressBarRef}
                  onMouseDown={onProgressMouseDown}
                  onMouseMove={handleProgressHover}
                  onMouseLeave={() => setHoverTime(null)}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    setIsScrubbing(true);
                    const touch = e.touches[0];
                    handleProgressScrub({ clientX: touch.clientX });
                  }}
                  onTouchMove={(e) => {
                    e.stopPropagation();
                    const touch = e.touches[0];
                    handleProgressScrub({ clientX: touch.clientX });
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    setIsScrubbing(false);
                  }}
                  style={{
                    position: "relative", height: isTouch ? 44 : 32, display: "flex",
                    alignItems: "center", cursor: "pointer",
                    padding: `0 ${R.progressBarPad}`, pointerEvents: "auto",
                    touchAction: "none",
                  }}
                >
                  {/* Hover time tooltip with preview thumbnail */}
                  <AnimatePresence>
                    {hoverTime != null && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.95 }}
                        transition={SPRING_FAST}
                        style={{
                          position: "absolute", bottom: 28,
                          left: `${hoverX}px`, transform: "translateX(-50%)",
                          pointerEvents: "none",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                          <div style={{
                            background: "var(--skin-badge-bg, rgba(28,28,30,0.92))",
                            backdropFilter: "blur(var(--skin-hud-blur, 24px)) saturate(160%)",
                            WebkitBackdropFilter: "blur(var(--skin-hud-blur, 24px)) saturate(160%)",
                            color: "#fff",
                            padding: `4px ${R.padSmall}`, borderRadius: R.radiusSmall,
                            fontSize: R.fontSmall, fontWeight: 700, letterSpacing: "0.5px",
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                            fontVariantNumeric: "tabular-nums",
                            border: "1px solid rgba(255,255,255,0.08)",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                            whiteSpace: "nowrap",
                          }}>
                            {fmt(hoverTime)}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Track */}
                  <div
                    ref={progressTrackRef}
                    style={{
                    position: isFullscreen ? "fixed" : "relative", width: "100%",
                    height: hoverTime != null || isScrubbing ? (isTouch ? 6 : 5) : (isTouch ? 4 : 3),
                    background: "var(--skin-progress-track, rgba(255,255,255,0.12))",
                    borderRadius: 3,
                    transition: "height 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}>
                    {duration > 0 && bp > pp && <div style={{
                      position: "absolute", inset: 0,
                      left: `${Math.min(pp, 100)}%`,
                      width: `${Math.min(bp - pp, 100 - pp)}%`,
                      background: "var(--skin-progress-buffered, rgba(255,255,255,0.14))", borderRadius: 3,
                      transition: "width 0.3s ease",
                    }} />}
                    {duration > 0 && <div style={{
                      position: "absolute", inset: 0, width: `${Math.min(pp, 100)}%`,
                      background: "var(--skin-progress-fill, var(--accent-gradient, rgba(255,255,255,0.85)))",
                      borderRadius: 3,
                      boxShadow: "var(--skin-progress-glow, 0 0 6px var(--accent-glow, rgba(255,255,255,0.15)))",
                      transition: isScrubbing ? "none" : "width 0.1s linear",
                    }} />}
                    {duration > 0 && !(currentTime === 0 && !isPlaying && !isScrubbing) && (
                      <motion.div
                        animate={{
                          left: `${Math.max(0, Math.min(pp, 100))}%`,
                          width: hoverTime != null || isScrubbing ? (isTouch ? 18 : 14) : (isTouch ? 10 : 0),
                          height: hoverTime != null || isScrubbing ? (isTouch ? 18 : 14) : (isTouch ? 10 : 0),
                          opacity: hoverTime != null || isScrubbing || isTouch ? 1 : 0,
                        }}
                        transition={SPRING}
                        style={{
                          position: "absolute", top: "50%",
                          transform: "translate(-50%, -50%)",
                          borderRadius: "50%",
                          background: "#fff",
                          boxShadow: isScrubbing ? "0 0 14px rgba(255,255,255,0.9), 0 2px 10px rgba(0,0,0,0.7)" : isTouch ? "0 0 8px rgba(255,255,255,0.4)" : "0 2px 10px rgba(0,0,0,0.5)",
                          cursor: "grab", pointerEvents: "none",
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* TITLE ROW */}
                <div className="streamly-player-title-row" style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: `${R.padTiny} ${R.progressBarPad} 2px`, pointerEvents: "none", gap: "clamp(8px, 2vw, 12px)",
                }}>
                  <span style={{
                    color: "rgba(255,255,255,0.4)", fontSize: R.fontSmall, fontWeight: 600,
                    fontFamily: "var(--skin-time-font, 'SF Mono', Menlo, monospace)",
                    fontVariantNumeric: "tabular-nums", letterSpacing: "0.3px",
                    flexShrink: 0,
                  }}>
                    {fmt(currentTime)} / {fmt(duration)}
                  </span>
                  <div className="streamly-player-title-meta" style={{
                    display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)",
                    minWidth: 0, flex: 1, justifyContent: "center",
                  }}>
                    <span style={{
                      color: "rgba(255,255,255,0.85)", fontSize: "clamp(12px, 1.5vw, 15px)",
                      fontWeight: 700, letterSpacing: "-0.01em",
                      textShadow: "0 1px 10px rgba(0,0,0,0.9), 0 0 24px rgba(0,0,0,0.5)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      maxWidth: isTouch ? "min(190px, 36vw)" : "min(320px, 44vw)",
                      fontFamily: "var(--skin-font-body, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif)",
                    }}>
                      {movie?.title || movie?.name}
                    </span>
                    {isTvContent && season && (
                      <span className="streamly-player-episode-label" style={{
                        color: "rgba(255,255,255,0.6)", fontSize: "clamp(10px, 1.2vw, 12px)",
                        fontWeight: 700, letterSpacing: "0.3px",
                        background: "rgba(255,255,255,0.06)",
                        padding: "3px 10px", borderRadius: 100,
                        border: "1px solid rgba(255,255,255,0.06)",
                        whiteSpace: "nowrap", flexShrink: 0,
                        fontFamily: "var(--skin-font-body, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif)",
                      }}>
                        S{season} E{episode}
                      </span>
                    )}
                    {movie?.releaseYear && (
                      <span className="streamly-player-release-year" style={{
                        color: "rgba(255,255,255,0.35)", fontSize: R.fontSmall, fontWeight: 600,
                        flexShrink: 0, letterSpacing: "0.3px",
                        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                      }}>{movie.releaseYear}</span>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, minWidth: "clamp(50px, 10vw, 70px)" }} />
                </div>

                {/* ═══ CONTROL ROW (skinned by Player UI preset) ══════ */}
                <div className="streamly-player-control-row" onClick={(e) => e.stopPropagation()} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: `${R.controlRowPad} ${R.padMedium} ${R.padMedium}`, pointerEvents: "auto",
                  margin: "0 var(--skin-bar-inset, 0px) var(--skin-bar-inset, 0px)",
                  background: "var(--skin-bar-bg, transparent)",
                  backdropFilter: "blur(var(--skin-bar-blur, 16px))",
                  WebkitBackdropFilter: "blur(var(--skin-bar-blur, 16px))",
                  border: "var(--skin-bar-border, none)",
                  borderRadius: "var(--skin-bar-radius, 0px)",
                  boxShadow: "var(--skin-chrome-shadow, none)",
                }}>
                  {/* Left cluster — Player UI Studio zone: bottomLeft */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    {zoneKeys("bottomLeft").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                  </div>

                  {/* Center cluster — Player UI Studio zone: bottomCenter */}
                  {zoneKeys("bottomCenter").length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, flex: "1 1 auto", minWidth: 0, overflow: "hidden", padding: "0 4px" }}>
                      {zoneKeys("bottomCenter").map((key) => (
                        <React.Fragment key={key}>{barControl(key, "icon")}</React.Fragment>
                      ))}
                    </div>
                  )}

                  {/* Right cluster — Player UI Studio zone: bottomRight */}
                  <div style={{ display: "flex", alignItems: "center", gap: isTouch ? 2 : 4, flexShrink: 0 }}>
                    <input type="file" accept=".srt,.vtt" ref={subtitleInputRef} onChange={handleSubtitleUpload} style={{ display: "none" }} />
                    {zoneKeys("bottomRight").map((key) => (
                      <React.Fragment key={key}>{barControl(key, "bar")}</React.Fragment>
                    ))}
                    {hasManagedSettings && (
                      <motion.button onClick={(e) => {
                          e.stopPropagation();
                          setShowSettings(!showSettings); setShowSubtitlesMenu(false);
                        }}
                        whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
                        transition={SPRING}
                        style={{
                          background: showSettings ? "rgba(255,255,255,0.08)" : "transparent",
                          border: showSettings ? "1px solid rgba(255,255,255,0.08)" : "none",
                          color: showSettings ? "#fff" : "rgba(255,255,255,0.6)",
                          cursor: "pointer", width: R.btnSmall, height: R.btnSmall, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <motion.div animate={{ rotate: showSettings ? 90 : 0 }} transition={SPRING}>
                          <Settings size={15} />
                        </motion.div>
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile tap-outside dismiss backdrop for popup menus */}
      {isTouch && (showSettings || showSubtitlesMenu || showAudioMenu) && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowSettings(false);
            setShowSubtitlesMenu(false);
            setShowAudioMenu(false);
          }}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 48,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        />
      )}

      {/* ═══ SETTINGS PANEL ═════════════════════════════════════ */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: isTouch ? "calc(12px + var(--sab))" : "calc(clamp(40px, 8vw, 60px) + var(--sab))",
              right: isTouch ? "auto" : "calc(clamp(8px, 2vw, 16px) + var(--sar))",
              left: isTouch ? "50%" : "auto",
              transform: isTouch ? "translateX(-50%)" : "none",
              zIndex: 50,
              width: isTouch ? "min(calc(100% - 24px), 360px)" : R.panelSettings,
              maxHeight: isTouch ? "min(68vh, 420px)" : "50vh",
              background: "var(--skin-panel-bg, rgba(18,18,20,0.92))",
              backdropFilter: "blur(var(--skin-panel-blur, 40px)) saturate(180%)",
              WebkitBackdropFilter: "blur(var(--skin-panel-blur, 40px)) saturate(180%)",
              border: "var(--skin-panel-border, 1px solid rgba(255,255,255,0.08))",
              borderRadius: isTouch ? 20 : R.radiusMedium,
              padding: `${R.padMedium} ${R.padMedium}`,
              color: "#fff",
              overflowY: "auto",
              boxShadow: "0 16px 56px rgba(0,0,0,0.7), inset 0 0.5px 0 rgba(255,255,255,0.08)",
            }}
          >
            {/* Speed */}
            {hasManagedSettings && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Playback Speed</div>
              <div style={{ display: "flex", gap: "clamp(4px, 1vw, 6px)", flexWrap: "wrap" }}>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <motion.button key={r} onClick={() => { sendCommand("setPlaybackRate", [r]); setPlaybackRate(r); setShowSettings(false); }}
                    whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
                    transition={SPRING}
                    style={{
                      background: playbackRate === r ? "rgba(var(--accent-primary-rgb), 0.16)" : "rgba(255,255,255,0.02)",
                      color: playbackRate === r ? "var(--accent-primary, #fff)" : "rgba(255,255,255,0.5)",
                      border: playbackRate === r ? "1px solid rgba(var(--accent-primary-rgb), 0.4)" : "1px solid rgba(255,255,255,0.04)",
                      padding: `${R.padSmall} ${R.padSmall}`, borderRadius: 100, cursor: "pointer",
                      fontSize: R.fontSmall, fontWeight: 700,
                      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                    }}
                  >
                    {r}x
                  </motion.button>
                ))}
              </div>
            </div>
            )}

            {/* Quality */}
            {qualities?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Quality</div>
                <div style={{ display: "flex", gap: "clamp(4px, 1vw, 6px)", flexWrap: "wrap" }}>
                  <motion.button onClick={() => {
                    sendCommand("setQuality", [-1]);
                    setCurrentQuality({ id: -1, name: 'Auto' }); setShowSettings(false);
                  }}
                    whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} transition={SPRING}
                    style={{
                      background: (currentQuality?.id === -1 || (!currentQuality && qualities.length > 1)) ? "rgba(var(--accent-primary-rgb), 0.16)" : "rgba(255,255,255,0.02)",
                      color: (currentQuality?.id === -1 || (!currentQuality && qualities.length > 1)) ? "var(--accent-primary, #fff)" : "rgba(255,255,255,0.5)",
                      border: (currentQuality?.id === -1) ? "1px solid rgba(var(--accent-primary-rgb), 0.4)" : "1px solid rgba(255,255,255,0.04)",
                      padding: `${R.padSmall} ${R.padSmall}`, borderRadius: 100, cursor: "pointer", fontSize: R.fontSmall, fontWeight: 700,
                      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                    }}
                  >Auto</motion.button>
                  {qualities.map((q) => (
                    <motion.button key={q.id} onClick={() => {
                      sendCommand("setQuality", [q.id]);
                      setCurrentQuality(q); setShowSettings(false);
                    }}
                      whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} transition={SPRING}
                      style={{
                        background: (currentQuality?.id === q.id) ? "rgba(var(--accent-primary-rgb), 0.16)" : "rgba(255,255,255,0.02)",
                        color: (currentQuality?.id === q.id) ? "var(--accent-primary, #fff)" : "rgba(255,255,255,0.5)",
                        border: (currentQuality?.id === q.id) ? "1px solid rgba(var(--accent-primary-rgb), 0.4)" : "1px solid rgba(255,255,255,0.04)",
                        padding: `${R.padSmall} ${R.padSmall}`, borderRadius: 100, cursor: "pointer", fontSize: R.fontSmall, fontWeight: 700,
                        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                      }}
                    >
                      {q.name || q.height + "p" || q.id}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Audio */}
            {audioTracks?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Audio</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {audioTracks.map((t, i) => (
                    <button key={i} onClick={() => {
                      sendCommand("setAudioTrack", [t.id || i]);
                      setCurrentAudioTrack(t); setShowSettings(false);
                    }}
                      style={{
                        background: (currentAudioTrack?.id === t.id) ? "rgba(var(--accent-primary-rgb), 0.12)" : "transparent",
                        color: (currentAudioTrack?.id === t.id) ? "var(--accent-primary, #fff)" : "rgba(255,255,255,0.5)",
                        border: "none", padding: `${R.padSmall} ${R.padSmall}`, borderRadius: 10,
                        cursor: "pointer", fontSize: R.fontMedium, fontWeight: 600, textAlign: "left",
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                      }}
                    >
                      {t.name || t.language || `Track ${i + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Aspect Ratio */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Aspect Ratio</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {ASPECT_RATIOS.map((ar, i) => (
                  <button key={ar.name} onClick={() => { aspectManuallySetRef.current = true; setAspectRatioIndex(i); setShowSettings(false); setShowAspectRatioArc(true); if (aspectRatioArcTimerRef.current) clearTimeout(aspectRatioArcTimerRef.current); aspectRatioArcTimerRef.current = setTimeout(() => setShowAspectRatioArc(false), 1200); }}
                    style={{
                      background: aspectRatioIndex === i ? "rgba(var(--accent-primary-rgb), 0.12)" : "transparent",
                      color: aspectRatioIndex === i ? "var(--accent-primary, #fff)" : "rgba(255,255,255,0.5)",
                      border: aspectRatioIndex === i ? "1px solid rgba(var(--accent-primary-rgb), 0.3)" : "none",
                      padding: `${R.padSmall} ${R.padSmall}`, borderRadius: 10, cursor: "pointer",
                      fontSize: R.fontMedium, fontWeight: 600, display: "flex", justifyContent: "space-between",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}
                  >
                    {ar.name} {aspectRatioIndex === i && <Check size={11} strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Automations */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Automations</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Auto-Skip Intro", val: autoSkipIntro, set: (value) => setPreference("autoSkipIntro", value), key: "streamly_autoSkip" },
                  ...(movie?.isSeries ? [{ label: "Auto-Play Next", val: autoPlayNext, set: (value) => setPreference("autoplay", value) }] : []),
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: R.fontMedium, fontWeight: 600, color: "rgba(255,255,255,0.6)", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>{item.label}</span>
                    <div onClick={() => { const v = !item.val; item.set(v); if (item.key) localStorage.setItem(item.key, String(v)); }}
                      style={{
                        width: isTouch ? 44 : 36, height: isTouch ? 24 : 20,
                        background: item.val ? "var(--accent-gradient, rgba(255,255,255,0.85))" : "rgba(255,255,255,0.1)",
                        borderRadius: 100, position: "relative", cursor: "pointer",
                        transition: "background 0.25s",
                      }}
                    >
                      <div style={{
                        width: isTouch ? 20 : 16, height: isTouch ? 20 : 16, background: "#fff", borderRadius: "50%",
                        position: "absolute", top: 2,
                        left: item.val ? (isTouch ? 22 : 18) : 2,
                        transition: "left 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.25s",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "12px 0" }} />
            <button onClick={(e) => { e.stopPropagation(); setUseNativeControls(true); setShowSettings(false); }}
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(255,255,255,0.06)", padding: 10, borderRadius: 12,
                cursor: "pointer", fontSize: R.fontMedium, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: "clamp(4px, 1vw, 6px)",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              }}
            >
              <Captions size={13} /> Native Audio
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SUBTITLES PANEL ═════════════════════════════════════ */}
      <AnimatePresence>
        {showSubtitlesMenu && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: isTouch ? "calc(12px + var(--sab))" : "calc(clamp(40px, 8vw, 60px) + var(--sab))",
              right: isTouch ? "auto" : "calc(clamp(36px, 8vw, 56px) + var(--sar))",
              left: isTouch ? "50%" : "auto",
              transform: isTouch ? "translateX(-50%)" : "none",
              zIndex: 50,
              width: isTouch ? "min(calc(100% - 24px), 360px)" : R.panelSubtitles,
              maxHeight: isTouch ? "min(68vh, 420px)" : "45vh",
              background: "var(--skin-panel-bg, rgba(18,18,20,0.92))",
              backdropFilter: "blur(var(--skin-panel-blur, 40px)) saturate(180%)",
              WebkitBackdropFilter: "blur(var(--skin-panel-blur, 40px)) saturate(180%)",
              border: "var(--skin-panel-border, 1px solid rgba(255,255,255,0.08))",
              borderRadius: isTouch ? 20 : R.radiusMedium,
              padding: `${R.padMedium} ${R.padMedium}`,
              color: "#fff",
              overflowY: "auto",
              boxShadow: "0 16px 56px rgba(0,0,0,0.7), inset 0 0.5px 0 rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Subtitles</span>
              <div onClick={(e) => { e.stopPropagation(); setSubtitleEnabled(!subtitleEnabled); }}
                style={{
                  width: isTouch ? 44 : 36, height: isTouch ? 24 : 20,
                  background: subtitleEnabled ? "var(--accent-gradient, rgba(255,255,255,0.85))" : "rgba(255,255,255,0.1)",
                  borderRadius: 100, position: "relative", cursor: "pointer",
                  transition: "background 0.25s",
                }}
              >
                <div style={{
                  width: isTouch ? 20 : 16, height: isTouch ? 20 : 16, background: "#fff", borderRadius: "50%",
                  position: "absolute", top: 2,
                  left: subtitleEnabled ? (isTouch ? 22 : 18) : 2,
                  transition: "left 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.25s",
                }} />
              </div>
            </div>
            <div data-scrollable="true" style={{
              background: "rgba(255,255,255,0.02)", padding: 8, borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.04)", maxHeight: 140,
              overflowY: "auto", marginBottom: 12,
            }}>
              {availableSubtitleLangs.length > 0 ? (
                availableSubtitleLangs.map((l, i) => (
                  <button key={i} onClick={() => { handleSubtitleLanguageSelect(l.downloadLink); setShowSubtitlesMenu(false); }}
                    style={{
                      display: "block", width: "100%", background: "transparent",
                      color: "rgba(255,255,255,0.75)", border: "none",
                      padding: `${R.padMedium} ${R.padSmall}`, borderRadius: 8, cursor: "pointer",
                      fontSize: R.fontMedium, fontWeight: 600, textAlign: "left", transition: "background 0.12s",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {l.language}
                  </button>
                ))
              ) : (
                <div style={{ fontSize: R.fontSmall, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 12, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
                  {isFetchingSubtitles ? "Searching..." : "No subtitles found"}
                </div>
              )}
            </div>
            {/* Subtitle Sync Offset */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              padding: "8px 10px",
              marginBottom: 10,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: R.fontSmall, color: "rgba(255,255,255,0.6)", fontWeight: 500, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>
                  Sync Offset
                </span>
                <span style={{
                  fontSize: R.fontSmall,
                  fontVariantNumeric: "tabular-nums",
                  color: subtitleOffset === 0 ? "rgba(255,255,255,0.4)" : "var(--accent-primary, #60a5fa)",
                  fontWeight: 600,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                }}>
                  {subtitleOffset > 0 ? `+${subtitleOffset.toFixed(1)}s` : `${subtitleOffset.toFixed(1)}s`}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSubtitleOffset((o) => Math.max(-10, Math.round((o - 0.5) * 10) / 10));
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "none",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "4px 0",
                    fontSize: R.fontSmall,
                    cursor: "pointer",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  }}
                >
                  -0.5s
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSubtitleOffset(0);
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "none",
                    color: "rgba(255,255,255,0.6)",
                    borderRadius: 6,
                    padding: "4px 0",
                    fontSize: R.fontSmall,
                    cursor: "pointer",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSubtitleOffset((o) => Math.min(10, Math.round((o + 0.5) * 10) / 10));
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "none",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "4px 0",
                    fontSize: R.fontSmall,
                    cursor: "pointer",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  }}
                >
                  +0.5s
                </button>
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); subtitleInputRef.current?.click(); setShowSubtitlesMenu(false); }}
              style={{
                width: "100%", background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.7)",
                border: "1px dashed rgba(255,255,255,0.08)", padding: 12, borderRadius: 12,
                cursor: "pointer", fontSize: R.fontMedium, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: "clamp(4px, 1vw, 6px)",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              }}
            >
              <Upload size={12} /> {subtitleFileName || "Upload (.srt)"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ AUDIO TRACKS PANEL ═══════════════════════════════════ */}
      <AnimatePresence>
        {showAudioMenu && audioTracks?.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: isTouch ? "calc(12px + var(--sab))" : "calc(clamp(40px, 8vw, 60px) + var(--sab))",
              right: isTouch ? "auto" : "calc(clamp(68px, 14vw, 96px) + var(--sar))",
              left: isTouch ? "50%" : "auto",
              transform: isTouch ? "translateX(-50%)" : "none",
              zIndex: 50,
              width: isTouch ? "min(calc(100% - 24px), 360px)" : R.panelSubtitles,
              maxHeight: isTouch ? "min(68vh, 420px)" : "40vh",
              background: "var(--skin-panel-bg, rgba(18,18,20,0.92))",
              backdropFilter: "blur(var(--skin-panel-blur, 40px)) saturate(180%)",
              WebkitBackdropFilter: "blur(var(--skin-panel-blur, 40px)) saturate(180%)",
              border: "var(--skin-panel-border, 1px solid rgba(255,255,255,0.08))",
              borderRadius: isTouch ? 20 : R.radiusMedium,
              padding: `${R.padMedium} ${R.padMedium}`,
              color: "#fff",
              overflowY: "auto",
              boxShadow: "0 16px 56px rgba(0,0,0,0.7), inset 0 0.5px 0 rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 12, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Audio Track</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {audioTracks.map((t, i) => (
                <button key={i} onClick={() => {
                  sendCommand("setAudioTrack", [t.id || i]);
                  setCurrentAudioTrack(t); setShowAudioMenu(false);
                }}
                  style={{
                    width: "100%", background: (currentAudioTrack?.id === t.id) ? "rgba(var(--accent-primary-rgb), 0.12)" : "transparent",
                    color: (currentAudioTrack?.id === t.id) ? "var(--accent-primary, #fff)" : "rgba(255,255,255,0.6)",
                    border: "none", padding: `${R.padSmall} ${R.padSmall}`, borderRadius: 10,
                    cursor: "pointer", fontSize: R.fontMedium, fontWeight: 600, textAlign: "left",
                    display: "flex", alignItems: "center", gap: 8,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: (currentAudioTrack?.id === t.id) ? "#fff" : "transparent",
                    border: "1px solid rgba(255,255,255,0.3)",
                    flexShrink: 0,
                  }} />
                  {t.name || t.language || `Track ${i + 1}`}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTEXT MENU */}
      <AnimatePresence>
        {contextMenu.show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{
              position: "absolute", left: contextMenu.x, top: contextMenu.y, zIndex: 100,
              background: "var(--skin-badge-bg, rgba(12,12,14,0.94))", backdropFilter: "blur(var(--skin-hud-blur, 24px))",
              WebkitBackdropFilter: "blur(var(--skin-hud-blur, 24px))",
              border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12,
              padding: "4px 0", minWidth: "clamp(140px, 30vw, 180px)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.6)", pointerEvents: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            {[
              { icon: <Link size={12} />, label: "Copy URL", action: () => { navigator.clipboard.writeText(window.location.href); setContextMenu({ show: false, x: 0, y: 0 }); showToast("Copied"); } },
              { icon: <Repeat size={12} color={isLooping ? "#fff" : undefined} />, label: isLooping ? "Loop On" : "Loop Off", action: () => { setIsLooping(!isLooping); setContextMenu({ show: false, x: 0, y: 0 }); } },
              ...(movie?.posterUrl ? [{ icon: <Film size={12} />, label: "Open Poster", action: () => { window.open(movie.posterUrl, "_blank"); setContextMenu({ show: false, x: 0, y: 0 }); } }] : []),
              { icon: <Keyboard size={12} />, label: "Shortcuts", action: () => { setShowShortcuts(true); setContextMenu({ show: false, x: 0, y: 0 }); } },
            ].map(({ icon, label, action }, i) => (
              <button key={i} onClick={action}
                style={{
                  display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)", width: "100%",
                  background: "transparent", border: "none", color: "rgba(255,255,255,0.8)",
                  padding: `${isTouch ? "12px" : "8px"} 14px`, cursor: "pointer", fontSize: R.fontMedium, fontWeight: 600,
                  textAlign: "left", transition: "background 0.1s",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {icon} {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomVideoPlayer;
