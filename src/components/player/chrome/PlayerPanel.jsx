// The settings menu frame matching player-v4.html:
// - Floating sheet card on desktop / bottom-sheet drawer on mobile
// - Grab handle for touch dismissal (.grab)
// - Integrated header (.hd) with back arrow (.bk > #i-back), title (h2#st), extra slot (#xs), and close button (.btn > #i-x)
// - Viewport (.vp) with panes (.pane.in > .pi)
import { useLayoutEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import PlayerSvgSprite from "./PlayerSvgSprite";

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

export default function PlayerPanel({
  panel,
  panelRef,
  onClose,
  onBackToSettings,
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
          initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
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
          <PlayerSvgSprite />

          {/* Mobile drawer drag handle */}
          <div className="grab" id="grab" aria-hidden="true" />

          {/* Header */}
          <div className={["hd", isSub ? "np-subhead" : ""].filter(Boolean).join(" ")}>
            {isSub ? (
              <button
                type="button"
                className="btn bk"
                id="bk"
                aria-label={backLabel}
                onClick={backAction}
              >
                <svg className="ic"><use href="#i-back" /></svg>
              </button>
            ) : null}

            <h2 className="np-subtitle" id="st">{TITLES[panel] || "Settings"}</h2>

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

          {isSub ? <div className="np-subline" /> : null}

          {/* Dynamic Viewport */}
          <div className="vp np-vp" id="vp">
            <motion.div
              key={panel}
              className="np-page pane in"
              initial={reduceMotion ? false : { opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
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
