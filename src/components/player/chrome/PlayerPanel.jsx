// The settings menu frame: the reference design's 514px pane at right 40 /
// bottom 112, opening up out of the gear.
//
// The "Pitch" chrome (2026-11) keeps the panel shell generic. The root page has
// no header (the tiles ARE the header); submenus get the back arrow + title
// row, the subtitles page gets its "Customize" action, and the episodes page
// gets a season label. The page bodies stay in PlayerMenus.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const TITLES = {
  settings: "Settings",
  subs: "Subtitles",
  audio: "Audio",
  video: "Quality",
  servers: "Source",
  playback: "Playback settings",
  appearance: "Appearance",
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
          role="dialog"
          aria-label={ARIA_LABELS[panel] || "Settings"}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          data-panel={panel}
          className={["np-menu", isSub ? "np-menu-sub" : "np-menu-root", isSub ? HEIGHT_CLASS[panel] || "np-menu-list" : ""]
            .filter(Boolean)
            .join(" ")}
        >
          {/* The reference design has no close X (click-outside and the gear
              close it). Keep a visually hidden close control so keyboard and
              screen-reader users still have an explicit exit. */}
          <button type="button" className="np-sr-only" aria-label="Close panel" onClick={onClose}>
            Close panel
          </button>

          {isSub ? (
            <>
              <div className="np-subhead">
                <button type="button" className="np-subback" aria-label={backLabel} onClick={backAction}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
                  </svg>
                </button>
                <span className="np-subtitle">{TITLES[panel] || "Settings"}</span>
                {isEpisodes && season ? <span className="np-sbtn np-sbtn-static">Season {season}</span> : null}
                {actionLabel ? (
                  <button type="button" className="np-subact" onClick={onAction}>
                    {actionLabel}
                  </button>
                ) : null}
              </div>
              <div className="np-subline" />
            </>
          ) : null}

          <motion.div
            key={panel}
            className="np-page"
            initial={reduceMotion ? false : { opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {children}
          </motion.div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
