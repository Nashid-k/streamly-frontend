// The slide-in settings panel shell.
//
// Owns the shell only: the slide-from-edge animation (right on desktop, up from
// the bottom on touch), the surface dimensions, the header (back-to-settings +
// title + close) and the focus target. Each panel's deeply-coupled list content
// is passed in as `children` from the engine, so extraction removes the repeated
// shell without having to thread every list's state through here.
import { AnimatePresence, motion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import IconBtn from "./IconBtn";
import { IconArrowLeft, IconClose } from "./icons";
import { IS_TOUCH } from "./constants";
import { GLASS_BG_STRONG, GLASS_BLUR, GLASS_BORDER } from "./theme";

const TITLES = {
  settings: "Settings",
  subs: "Subtitles",
  audio: "Audio",
  video: "Video Quality",
  speed: "Playback Speed",
  aspect: "Aspect Ratio",
  servers: "Servers",
};

const ARIA_LABELS = {
  settings: "Settings",
  subs: "Subtitles",
  audio: "Audio",
  video: "Video quality",
  speed: "Playback speed",
  servers: "Servers",
  aspect: "Aspect ratio",
};

const WIDE_PANELS = ["settings", "subs", "audio", "video", "speed", "aspect"];

export default function PlayerPanel({ panel, panelRef, onClose, onBackToSettings, children }) {
  const M = useMotionTokens();
  return (
    <AnimatePresence>
      {panel && panel !== "episodes" && (
        <motion.aside
          // Slides from the edge it lives on: right on desktop, up from the
          // bottom on touch (where it is a sheet, not a side pane).
          initial={IS_TOUCH ? { y: "100%" } : { x: "100%" }}
          animate={IS_TOUCH ? { y: 0 } : { x: 0 }}
          exit={IS_TOUCH ? { y: "100%" } : { x: "100%" }}
          transition={M.SPRING.SHEET}
          ref={panelRef}
          role="dialog"
          aria-label={ARIA_LABELS[panel] || "Aspect ratio"}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="np-panel-surface"
          style={{
            position: "absolute",
            right: IS_TOUCH ? 0 : 16,
            top: IS_TOUCH ? undefined : 72,
            bottom: IS_TOUCH ? undefined : "auto",
            width: WIDE_PANELS.includes(panel)
              ? IS_TOUCH
                ? "100%"
                : "min(400px, 36%)"
              : IS_TOUCH
                ? "100%"
                : "min(400px, 36%)",
            maxHeight: IS_TOUCH ? "85%" : "min(calc(100% - 152px), 760px)",
            height: IS_TOUCH ? undefined : "auto",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: GLASS_BG_STRONG,
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            border: `1px solid ${GLASS_BORDER}`,
            borderRadius: IS_TOUCH ? "14px 14px 0 0" : 14,
            boxShadow: IS_TOUCH ? "none" : "0 18px 60px rgba(0,0,0,0.6)",
            // Bottom inset keeps rows clear of the Android/iOS gesture bar.
            padding: "16px 0 calc(12px + env(safe-area-inset-bottom, 0px))",
            zIndex: 6,
            // The sheet is a side pane, not a modal: the transport row stays
            // visible and operable, so it takes focus (not a focus outline)
            // rather than a ring when focused programmatically.
            outline: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "0 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {panel !== "settings" && (
                <button
                  type="button"
                  className="np-icon-btn"
                  aria-label="Back to settings"
                  onClick={onBackToSettings}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  <IconArrowLeft size={20} />
                </button>
              )}
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>
                {TITLES[panel] || ""}
              </span>
            </div>
            <IconBtn label="Close panel" onClick={onClose}>
              <IconClose size={18} />
            </IconBtn>
          </div>
          {/* One panel per control (Netflix): Subtitles / Audio / Video
              Quality each get their own sheet and their own scroll. */}
          {children}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}