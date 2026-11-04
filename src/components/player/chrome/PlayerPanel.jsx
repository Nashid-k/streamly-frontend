// The settings menu frame: the reference design's 514px pane at right 40 /
// bottom 112, opening up out of the gear.
//
// Player v4 enhancements:
// - Floating sheet card on desktop / bottom-sheet drawer on mobile
// - Grab handle for touch dismissal
// - Integrated header with animated sliding back arrow (.bk), title (h2#st),
//   extra slot (#xs), and close button (#x)
// - Dynamic viewport (.vp) supporting pane slide transitions (.pane.in / .pane.out)
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

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
  "sourcequality",
  "episodes",
]);

const HEIGHT_CLASS = {
  playback: "np-menu-tall",
  appearance: "np-menu-tall",
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
          data-panel={panel}
          className={["np-menu", "sheet", isSub ? "np-menu-sub" : "np-menu-root", isSub ? HEIGHT_CLASS[panel] || "np-menu-list" : ""]
            .filter(Boolean)
            .join(" ")}
        >
          {/* Mobile drawer drag handle */}
          <div className="grab" id="grab" aria-hidden="true" />

          {/* Header */}
          <div className={["hd", isSub ? "np-subhead" : ""].filter(Boolean).join(" ")}>
            {isSub ? (
              <button type="button" className="np-subback bk" id="bk" aria-label={backLabel} onClick={backAction}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width={22} height={22}>
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor" />
                </svg>
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
              className="btn np-close-btn"
              id="x"
              aria-label="Close panel"
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" width={20} height={20}>
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
              </svg>
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
              {children}
            </motion.div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
