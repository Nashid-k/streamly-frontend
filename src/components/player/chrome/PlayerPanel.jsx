// The settings menu frame matching player-v4.html:
// - Floating sheet card on desktop / bottom-sheet drawer on mobile
// - Grab handle for touch dismissal (.grab)
// - Integrated header (.hd) with back arrow (.bk > #i-back), title (h2#st), extra slot (#xs), and close button (.btn > #i-x)
// - Viewport (.vp) with panes (.pane.in > .pi)
import { useLayoutEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SPRING } from "../../../constants/motion";

const TITLES = {
  settings: "Settings",
  subs: "Subtitles",
  audio: "Audio",
  video: "Quality",
  servers: "Source",
  playback: "Playback settings",
  appearance: "Appearance",
  captions: "Subtitle style",
  sourcequality: "Source quality",
  episodes: "Seasons",
};

const ARIA_LABELS = {
  settings: "Settings",
  subs: "Subtitles",
  audio: "Audio",
  video: "Video quality",
  servers: "Servers",
  playback: "Playback settings",
  appearance: "Appearance",
  captions: "Subtitle style",
  sourcequality: "Source quality",
  episodes: "Episodes",
};

const SUB_PANELS = new Set([
  "subs",
  "audio",
  "video",
  "servers",
  "playback",
  "appearance",
  "captions",
  "sourcequality",
  "episodes",
]);

const HEIGHT_CLASS = {
  playback: "np-menu-tall",
  appearance: "np-menu-tall",
  captions: "np-menu-tall",
  episodes: "np-menu-episodes",
};

const pageVariants = {
  enter: (dir) => ({
    x: dir > 0 ? "24%" : dir < 0 ? "-24%" : 0,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      x: SPRING.LIFT,
      opacity: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
    },
  },
  exit: (dir) => ({
    x: dir > 0 ? "-18%" : dir < 0 ? "18%" : 0,
    opacity: 0,
    transition: {
      duration: 0.16,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

export default function PlayerPanel({
  panel,
  panelRef,
  onClose,
  onBackToSettings,
  direction = 0,
  season,
  actionLabel,
  onAction,
  children,
}) {
  const reduceMotion = useReducedMotion();
  const isSub = SUB_PANELS.has(panel);
  const isEpisodes = panel === "episodes";
  const backLabel = isEpisodes ? "Close episodes" : "Back to settings";
  const backAction = isEpisodes ? onClose : onBackToSettings;
  const paneBodyRef = useRef(null);

  useLayoutEffect(() => {
    const body = paneBodyRef.current;
    if (!body) return;
    body
      .querySelectorAll(".tile, .row, .th, .np-lbl, .seg, .range, .marks, .custom, .hr, .note")
      .forEach((item, index) => item.style.setProperty("--i", String(Math.min(index, 12))));
  }, [panel]);

  const handleRipple = (event) => {
    if (reduceMotion) return;
    const target = event.target.closest?.(".row, .tile, .th");
    if (!target || event.target.closest(".switch")) return;
    const rect = target.getBoundingClientRect();
    const size = Math.hypot(rect.width, rect.height) * 2;
    const ripple = document.createElement("span");
    ripple.className = "rip";
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${
      event.clientX - rect.left - size / 2
    }px;top:${event.clientY - rect.top - size / 2}px`;
    target.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  };

  return (
    <AnimatePresence>
      {panel ? (
        <motion.aside
          initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.95 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  opacity: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
                  y: SPRING.LIFT,
                  scale: SPRING.LIFT,
                }
          }
          style={{ transformOrigin: "bottom right" }}
          ref={panelRef}
          id="sheet"
          role="dialog"
          aria-label={ARIA_LABELS[panel] || "Settings"}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={handleRipple}
          data-panel={panel}
          className={["np-menu", "sheet", "open", isSub ? "np-menu-sub" : "np-menu-root", isSub ? HEIGHT_CLASS[panel] || "np-menu-list" : ""]
            .filter(Boolean)
            .join(" ")}
        >
          {/* Mobile drawer drag handle */}
          <div className="grab" id="grab" aria-hidden="true" />

          {/* Header */}
          <div className={["hd", isSub ? "np-subhead" : ""].filter(Boolean).join(" ")}>
            <AnimatePresence initial={false}>
              {isSub ? (
                <motion.button
                  key="bk-btn"
                  type="button"
                  className="btn bk"
                  id="bk"
                  aria-label={backLabel}
                  onClick={backAction}
                  initial={reduceMotion ? false : { width: 0, opacity: 0, x: -6 }}
                  animate={{ width: 44, opacity: 1, x: 0 }}
                  exit={reduceMotion ? false : { width: 0, opacity: 0, x: -6 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  style={{ overflow: "hidden" }}
                >
                  <svg className="ic"><use href="#i-back" /></svg>
                </motion.button>
              ) : null}
            </AnimatePresence>

            <AnimatePresence mode="wait" initial={false}>
              <motion.h2
                key={panel}
                className="np-subtitle"
                id="st"
                initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? false : { opacity: 0, y: -5 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {TITLES[panel] || "Settings"}
              </motion.h2>
            </AnimatePresence>

            <div id="xs" className="xs">
              {isEpisodes && season ? <span className="np-sbtn np-sbtn-static">Season {season}</span> : null}
              {actionLabel ? (
                <button type="button" className="np-subact" onClick={onAction}>
                  {actionLabel}
                </button>
              ) : null}
            </div>

            <button
              type="button"
              className="btn np-close-btn sr-only"
              id="x"
              aria-label="Close panel"
              onClick={onClose}
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clip: "rect(0, 0, 0, 0)",
                whiteSpace: "nowrap",
                border: 0,
                pointerEvents: "none",
              }}
            >
              <svg className="ic"><use href="#i-x" /></svg>
            </button>
          </div>

          {/* Dynamic Viewport */}
          <div
            className="vp np-vp"
            id="vp"
            onWheel={(e) => e.stopPropagation()}
          >
            <motion.div
              key={panel}
              className="np-page pane in"
              initial={
                reduceMotion
                  ? false
                  : {
                      opacity: 0,
                      x: direction > 0 ? 36 : direction < 0 ? -36 : 0,
                    }
              }
              animate={{ opacity: 1, x: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      x: SPRING.LIFT,
                      opacity: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
                    }
              }
            >
              <div className="np-pi pi" ref={paneBodyRef}>
                {children}
              </div>
            </motion.div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
