// The floating settings popup card (NEW PLAYER UI-UX.html, 2026-10-08).
//
// On desktop, anchors directly above the bottom chrome pill at the bottom-right
// with a scale+fade pop. On touch, acts as a bottom sheet.
// Back-chevron header navigates between submenus and root settings.
import { AnimatePresence, motion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import IconBtn from "./IconBtn";
import { IconChevronLeft, IconClose } from "./icons";
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

export default function PlayerPanel({ panel, panelRef, onClose, onBackToSettings, children }) {
  const M = useMotionTokens();
  return (
    <AnimatePresence>
      {panel && panel !== "episodes" && (
        <motion.aside
          initial={IS_TOUCH ? { y: "100%" } : { opacity: 0, scale: 0.94, y: 10 }}
          animate={IS_TOUCH ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
          exit={IS_TOUCH ? { y: "100%" } : { opacity: 0, scale: 0.94, y: 10 }}
          transition={IS_TOUCH ? M.SPRING.SHEET : { duration: 0.16, ease: [0.2, 0, 0, 1] }}
          ref={panelRef}
          role="dialog"
          aria-label={ARIA_LABELS[panel] || "Aspect ratio"}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="np-panel-surface"
          style={{
            position: "absolute",
            right: IS_TOUCH ? 0 : 18,
            bottom: IS_TOUCH ? 0 : 78,
            left: IS_TOUCH ? 0 : "auto",
            top: "auto",
            width: IS_TOUCH ? "100%" : "min(340px, calc(100% - 36px))",
            maxHeight: IS_TOUCH ? "85%" : "min(460px, calc(100% - 96px))",
            height: "auto",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: GLASS_BG_STRONG,
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            border: `1px solid ${GLASS_BORDER}`,
            borderRadius: IS_TOUCH ? "14px 14px 0 0" : 14,
            boxShadow: IS_TOUCH ? "none" : "0 16px 48px rgba(0,0,0,0.65)",
            padding: IS_TOUCH ? "8px 0 calc(12px + env(safe-area-inset-bottom, 0px))" : "4px 0 8px",
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
                {TITLES[panel] || ""}
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