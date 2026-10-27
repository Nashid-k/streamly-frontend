// The floating settings popup card (NEW PLAYER UI-UX.html, 2026-10-08).
//
// Anchors above the bottom chrome pill at the bottom-right with a scale+fade
// pop. ONE compact card on every device: the old touch variant stretched to a
// full-width bottom sheet, which on a phone buried the picture behind a wall of
// chrome — the viewer asked for the desktop-sized card on mobile too.
// Back-chevron header navigates between submenus and root settings.
import { AnimatePresence, motion } from "framer-motion";
import IconBtn from "./IconBtn";
import { IconChevronLeft, IconClose } from "./icons";
import { GLASS_BG_STRONG, GLASS_BLUR, GLASS_BORDER } from "./theme";

const TITLES = {
  settings: "Settings",
  subs: "Subtitles",
  audio: "Audio",
  video: "Video Quality",
  speed: "Playback Speed",
  aspect: "Aspect Ratio",
  servers: "Servers",
  sourcequality: "Source Quality",
  sleep: "Sleep Timer",
  substyle: "Subtitle Style",
};

const ARIA_LABELS = {
  settings: "Settings",
  subs: "Subtitles",
  audio: "Audio",
  video: "Video quality",
  speed: "Playback speed",
  servers: "Servers",
  aspect: "Aspect ratio",
  sourcequality: "Source quality",
  sleep: "Sleep timer",
  substyle: "Subtitle style",
};

export default function PlayerPanel({ panel, panelRef, onClose, onBackToSettings, children }) {
  return (
    <AnimatePresence>
      {panel && panel !== "episodes" && (
        <motion.aside
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 10 }}
          transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
          ref={panelRef}
          role="dialog"
          aria-label={ARIA_LABELS[panel] || TITLES[panel] || "Settings"}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="np-panel-surface"
          style={{
            position: "absolute",
            right: 18,
            bottom: 78,
            left: "auto",
            top: "auto",
            // Compact on every device: a 340px card capped to the frame, so a
            // phone gets the same tidy popover instead of a full-width sheet.
            width: "min(340px, calc(100% - 36px))",
            maxHeight: "min(460px, calc(100% - 96px))",
            height: "auto",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: GLASS_BG_STRONG,
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            border: `1px solid ${GLASS_BORDER}`,
            borderRadius: 14,
            boxShadow: "0 16px 48px rgba(0,0,0,0.65)",
            padding: "4px 0 8px",
            zIndex: 6,
            outline: "none",
          }}
        >
          <div
            className="np-panel-header"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 12px 6px 14px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
              userSelect: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: panel !== "settings" ? "pointer" : "default",
              }}
              onClick={panel !== "settings" ? onBackToSettings : undefined}
            >
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
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                  }}
                >
                  <IconChevronLeft size={18} strokeWidth={2.4} />
                </button>
              )}
              <span
                style={{
                  color: "#fff",
                  fontWeight: 500,
                  fontSize: 14.5,
                  letterSpacing: "-0.01em",
                }}
              >
                {TITLES[panel] || "Settings"}
              </span>
            </div>
            <IconBtn label="Close panel" onClick={onClose} size={28} style={{ opacity: 0.7 }}>
              <IconClose size={15} />
            </IconBtn>
          </div>
          {children}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}