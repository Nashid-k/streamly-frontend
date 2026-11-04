// The floating settings card: a compact glass popover anchored above the control
// deck. ONE compact card on every device: the old touch variant stretched to a
// full-width bottom sheet, which on a phone buried the picture behind a wall of
// chrome — the viewer asked for the desktop-sized card on mobile too.
// Back-chevron header navigates between submenus and root settings.
import { useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMotionTokens, motionSafe } from "../../../constants/motion";
import IconBtn from "./IconBtn";
import { IconChevronLeft, IconClose } from "./icons";
import { IS_TOUCH } from "./constants";
import { ACCENT, GLASS_BG_STRONG, GLASS_BLUR, GLASS_BORDER, RADIUS } from "./theme";

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

/* Menu depth, so a submenu opens FORWARD (content slides in from the right)
   and a back-chevron return plays the SAME motion in reverse. Depth 0 is the
   root; Subtitle style is the one second-level page. */
const DEPTH = {
  settings: 0,
  subs: 1,
  audio: 1,
  video: 1,
  speed: 1,
  aspect: 1,
  servers: 1,
  sourcequality: 1,
  sleep: 1,
  substyle: 2,
};

export default function PlayerPanel({ panel, panelRef, onClose, onBackToSettings, children }) {
  const panelRefDirection = useRef(0);
  const prevPanelRef = useRef(panel);
  const reduceMotion = useReducedMotion();
  const M = useMotionTokens(reduceMotion);
  if (panel !== prevPanelRef.current) {
    const from = DEPTH[prevPanelRef.current] ?? 0;
    const to = DEPTH[panel] ?? 0;
    panelRefDirection.current = to >= from ? 1 : -1;
    prevPanelRef.current = panel;
  }
  const back = panelRefDirection.current < 0;
  const bodyMotion = {
    initial: reduceMotion ? false : { opacity: 0, x: back ? -26 : 26 },
    animate: { opacity: 1, x: 0 },
    transition: motionSafe(reduceMotion, M.SPRING.SHEET),
  };
  const titleMotion = {
    initial: reduceMotion ? false : { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    transition: motionSafe(reduceMotion, M.SPRING.POP),
  };
  return (
    <AnimatePresence>
      {panel && panel !== "episodes" && (
        <motion.aside
          initial={M.MODAL_PANEL.initial}
          animate={M.MODAL_PANEL.animate}
          exit={M.MODAL_PANEL.exit}
          transition={M.MODAL_PANEL.transition}
          ref={panelRef}
          role="dialog"
          aria-label={ARIA_LABELS[panel] || TITLES[panel] || "Settings"}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="np-panel-surface"
          style={{
            position: "absolute",
            right: 18,
            // Sits just above the control deck, which is the surface it belongs
            // to; the two never overlap.
            bottom: IS_TOUCH ? 150 : 142,
            left: "auto",
            top: "auto",
            // Compact on every device: a 340px card capped to the frame, so a
            // phone gets the same tidy popover instead of a full-width sheet.
            width: "min(340px, calc(100% - 36px))",
            maxHeight: "min(460px, calc(100% - 166px))",
            height: "auto",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: GLASS_BG_STRONG,
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            border: `1px solid ${GLASS_BORDER}`,
            borderRadius: RADIUS.sheet,
            boxShadow: "0 28px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
            padding: "4px 0 10px",
            zIndex: 6,
            outline: "none",
            // The card grows out of the gear that opened it, so the open/close
            // reads as one connected gesture instead of a floating pop.
            transformOrigin: "100% 100%",
          }}
        >
          <div
            className="np-panel-header"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px 8px 16px",
              borderBottom: "1px solid rgba(149, 255, 80, 0.16)",
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
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: ACCENT,
                  boxShadow: "0 0 10px rgba(149,255,80,0.55)",
                  flexShrink: 0,
                }}
              />
              <motion.span
                key={panel}
                className="np-panel-title"
                {...titleMotion}
                style={{
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 15,
                  letterSpacing: "-0.01em",
                }}
              >
                {TITLES[panel] || "Settings"}
              </motion.span>
            </div>
            <IconBtn label="Close panel" onClick={onClose} size={28} style={{ opacity: 0.7 }}>
              <IconClose size={15} />
            </IconBtn>
          </div>
          {/* Keyed by page: navigating remounts the body and replays the
              direction-aware slide. No exit animation, so a tap can land the
              instant the header changes. */}
          <motion.div
            key={panel}
            className="np-panel-body"
            data-nav={back ? "back" : "forward"}
            {...bodyMotion}
          >
            {children}
          </motion.div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}