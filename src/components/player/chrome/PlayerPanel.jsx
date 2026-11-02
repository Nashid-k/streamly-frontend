// The floating settings popup card (NEW PLAYER UI-UX.html, 2026-10-08).
//
// Anchors above the bottom chrome pill at the bottom-right with a scale+fade
// pop. ONE compact card on every device: the old touch variant stretched to a
// full-width bottom sheet, which on a phone buried the picture behind a wall of
// chrome — the viewer asked for the desktop-sized card on mobile too.
// Back-chevron header navigates between submenus and root settings.
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { motionSafe } from "../../../constants/motion";
import IconBtn from "./IconBtn";
import { IconChevronLeft, IconClose } from "./icons";
import { GLASS_BG_STRONG, GLASS_BLUR, GLASS_BORDER, RIVO_FADE_UP, RIVO_MOTION } from "./theme";

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
  // Direction of the LAST navigation, kept across the panel swap so the body
  // that mounts is the body that knows which way it came from.
  const prevPanelRef = useRef(panel);
  const directionRef = useRef(1);
  if (panel !== prevPanelRef.current) {
    const from = DEPTH[prevPanelRef.current] ?? 0;
    const to = DEPTH[panel] ?? 0;
    directionRef.current = to >= from ? 1 : -1;
    prevPanelRef.current = panel;
  }
  // A closed panel (null) is a fade for the sheet itself; the body animation
  // only matters while one page replaces another.
  const reduceMotion = useReducedMotion();
  // rivo.st ships NO custom player chrome (measured 2026-11-02: their watch view
  // is a native-controls <video> inside their shell), so the card adopts THEIR
  // surface motion instead of our SHEET spring: `fadeUp`, 0.5s on `ease-tv`.
  // See theme.js RIVO_MOTION / RIVO_FADE_UP.
  const back = directionRef.current < 0;
  /* The page slide is FRAMER's, not a CSS keyframe. It used to be a keyframe on
     the keyed body, which a stylesheet can silently lose (an overriding
     `animation: none`, a reset, a sibling rule) and which the user reported as
     "zero animation" between pages. Framer writes the transform inline on the
     frame the page mounts, so the motion is not something a stylesheet can eat.
     Entry from the side it came from: forward pages from the right, back from
     the left. No exit animation — the new page's rows have to be tappable on
     the frame they appear, not 200ms later. */
  /* Timings are RIVO's own (see theme.js RIVO_MOTION): the page swap is their
     `.3s` step on `ease-tv`, the title their `.15s` micro step — the same two
     numbers their own stylesheet uses for every surface and hover. */
  const bodyMotion = {
    initial: reduceMotion ? false : { opacity: 0, x: back ? -26 : 26 },
    animate: { opacity: 1, x: 0 },
    transition: motionSafe(reduceMotion, RIVO_MOTION.STANDARD),
  };
  const titleMotion = {
    initial: reduceMotion ? false : { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    transition: motionSafe(reduceMotion, RIVO_MOTION.MICRO),
  };
  return (
    <AnimatePresence>
      {panel && panel !== "episodes" && (
        <motion.aside
          // RIVO's `fadeUp`, exactly: opacity 0 + translateY(12px) into place over
          // 0.5s on `ease-tv`. Their shell has no scale-in anywhere — the card
          // scaling up was our idiom, not theirs.
          initial={reduceMotion ? false : RIVO_FADE_UP.initial}
          animate={RIVO_FADE_UP.animate}
          // Closing is the arrival played backwards.
          exit={RIVO_FADE_UP.exit}
          transition={motionSafe(reduceMotion, RIVO_MOTION.SURFACE)}
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
              <motion.span
                key={panel}
                className="np-panel-title"
                {...titleMotion}
                style={{
                  color: "#fff",
                  fontWeight: 500,
                  fontSize: 14.5,
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