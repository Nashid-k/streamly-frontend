// The settings menu frame matching player-v4.html:
// - Floating sheet card on desktop / bottom-sheet drawer on mobile
// - Grab handle for touch dismissal (.grab)
// - Integrated header (.hd) with back arrow (.bk > #i-back), title (h2#st), extra slot (#xs), and close button (.btn > #i-x)
// - Viewport (.vp) with panes (.pane.in > .pi)
// - v4-fitted pane heights: .vp is set to the measured pane height (clamped to
//   the available space) and the CSS height transition animates page changes
// - Menu keyboard: Tab trap + ArrowUp/Down roving focus + ArrowLeft back (v4)
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "framer-motion";
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

/* v4's focus list for the sheet: header buttons plus every pane control, minus
   anything inside an exiting page (those pages are marked inert below). */
const menuTabbables = (root) =>
  root
    ? Array.from(
        root.querySelectorAll(
          ".hd button:not([disabled]), .pane button:not([disabled]), .pane select:not([disabled]), .pane input:not([type='hidden'])",
        ),
      ).filter((el) => !el.closest("[inert]"))
    : [];

/* The page body, wrapped so an EXITING page goes inert while framer animates it
   out — v4 marks `.pane.out` inert and the roving-focus list must never land on
   a page that is leaving. */
function PanePage({ initialOffset, transition, children, bodyRef }) {
  const isPresent = useIsPresent();
  return (
    <motion.div
      className="np-page pane in"
      initial={initialOffset}
      animate={{ opacity: 1, x: 0 }}
      transition={transition}
      inert={!isPresent}
    >
      <div className="np-pi pi" ref={bodyRef}>
        {children}
      </div>
    </motion.div>
  );
}

export default function PlayerPanel({
  panel,
  panelRef,
  onClose,
  onBackToSettings,
  direction = 0,
  season,
  seasonsAvailable,
  onChangeSeason,
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
  const vpRef = useRef(null);
  // Fresh open vs page swing: v4 fits the sheet instantly on open and animates
  // only between panes.
  const wasClosedRef = useRef(true);

  useLayoutEffect(() => {
    const body = paneBodyRef.current;
    if (!body) return;
    body
      .querySelectorAll(".tile, .row, .th, .np-lbl, .seg, .range, .marks, .custom, .hr, .note")
      .forEach((item, index) => item.style.setProperty("--i", String(Math.min(index, 12))));
  }, [panel]);

  /* v4's fit(): inflate .vp to 9999px so flex shrink against the sheet's
     max-height reveals the real available space, then set the viewport to the
     active pane's measured height. Pure DOM writes on refs; .vp's CSS
     `transition: height` animates the swing for us. */
  const fitPane = (instant) => {
    const vp = vpRef.current;
    const body = paneBodyRef.current;
    if (!vp || !body) return;
    const frozen = instant || reduceMotion;
    const prevTransition = vp.style.transition;
    const prevHeight = vp.style.height;
    if (frozen) vp.style.transition = "none";
    vp.style.height = "9999px";
    const avail = vp.clientHeight;
    vp.style.height = prevHeight;
    const target = Math.min(body.offsetHeight, Math.max(0, avail));
    if (vp.style.height !== `${target}px`) vp.style.height = `${target}px`;
    if (frozen) {
      void vp.offsetHeight;
      vp.style.transition = prevTransition;
    }
  };
  const fitPaneRef = useRef(fitPane);
  fitPaneRef.current = fitPane;

  useLayoutEffect(() => {
    const instant = wasClosedRef.current;
    wasClosedRef.current = false;
    fitPaneRef.current(instant);
    const body = paneBodyRef.current;
    if (body && typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => fitPaneRef.current(true));
      ro.observe(body);
      return () => ro.disconnect();
    }
    return undefined;
  }, [panel]);
  useEffect(() => {
    const onResize = () => fitPaneRef.current(true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Re-arm "instant" when the sheet closes, so the next open snaps too.
  useEffect(() => {
    if (!panel) wasClosedRef.current = true;
  }, [panel]);

  /* v4 menu keyboard: Tab stays inside the sheet, ArrowUp/Down walk the
     controls, ArrowLeft goes back (closes at the root). Everything here
     preventDefaults so the engine's document-level map ignores the key.
     Form controls keep their native keys — the engine map skips them anyway. */
  const handleMenuKey = (e) => {
    const sheet = panelRef?.current;
    if (!sheet) return;
    if (e.key === "Tab") {
      const nodes = menuTabbables(sheet);
      if (nodes.length === 0) return;
      e.preventDefault();
      const i = nodes.indexOf(document.activeElement);
      const next = e.shiftKey
        ? nodes[(i <= 0 ? nodes.length : i) - 1]
        : nodes[(i + 1) % nodes.length];
      next?.focus();
      return;
    }
    if (e.target.closest("input, select, textarea")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const nodes = menuTabbables(sheet);
      if (nodes.length === 0) return;
      e.preventDefault();
      const i = nodes.indexOf(document.activeElement);
      const next =
        i < 0
          ? nodes[e.key === "ArrowDown" ? 0 : nodes.length - 1]
          : nodes[(i + (e.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length];
      next?.focus();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (isSub) backAction?.();
      else onClose?.();
    }
  };

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
          onKeyDown={handleMenuKey}
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
              {isEpisodes && seasonsAvailable?.length > 1 && onChangeSeason ? (
                <select
                  id="sn"
                  className="np-sbtn np-season-select"
                  aria-label="Season"
                  value={season}
                  onChange={(e) => onChangeSeason(Number(e.target.value))}
                >
                  {seasonsAvailable.map((n) => (
                    <option key={n} value={n}>
                      Season {n}
                    </option>
                  ))}
                </select>
              ) : isEpisodes && season ? (
                <span className="np-sbtn np-sbtn-static">Season {season}</span>
              ) : null}
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

          {/* Dynamic Viewport — .vp height is fitted to the pane (v4's fit()) */}
          <div
            ref={vpRef}
            className="vp np-vp"
            id="vp"
            onWheel={(e) => e.stopPropagation()}
          >
            <PanePage
              key={panel}
              initialOffset={
                reduceMotion
                  ? false
                  : {
                      opacity: 0,
                      x: direction > 0 ? 36 : direction < 0 ? -36 : 0,
                    }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      x: SPRING.LIFT,
                      opacity: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
                    }
              }
              bodyRef={paneBodyRef}
            >
              {children}
            </PanePage>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
