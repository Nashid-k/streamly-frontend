// The bottom-layer Episodes rail (TV only).
//
// Lifted out of NativePlayerView.jsx verbatim; it was already a self-contained
// module-level component, so this is a pure move. It resolves the motion
// preference itself because it is not rendered inside the engine component.
import { useCallback, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import useRailArrows from "../../../hooks/useRailArrows";
import RailArrow from "../../RailArrow";
import { isEpAired, formatAirsDate } from "../../../utils/titleDetails";
import { IconCalendar, IconClose, IconPlay } from "./icons";
import { IS_TOUCH } from "./constants";
import { ACCENT } from "./theme";

export default function EpisodesRail({ episodes, episode, onSelectEpisode, setPanel, setBuffering, setResumeOffer }) {
  const railRef = useRef(null);
  const { canScrollLeft, canScrollRight, refresh } = useRailArrows(railRef);
  // Module-level component, so it resolves the preference itself.
  const M = useMotionTokens(useReducedMotion());

  const scroll = useCallback((dir) => {
    const el = railRef.current;
    if (!el) return;
    const amount = el.clientWidth > 800 ? el.clientWidth * 0.8 : el.clientWidth * 0.9;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    refresh();
  }, [refresh]);

  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={M.SPRING.SHEET}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)",
        zIndex: 6,
        padding: `40px 24px calc(30px + env(safe-area-inset-bottom, 0px))`,
        display: "flex",
        alignItems: "center",
      }}
    >
      {canScrollLeft && <RailArrow dir="left" onClick={() => scroll("left")} />}
      {canScrollRight && <RailArrow dir="right" onClick={() => scroll("right")} />}

      <div
        ref={railRef}
        style={{
          display: "flex",
          // Explicit: the cards must share one height, and `stretch` is what
          // guarantees that when a card's own content is shorter than its
          // neighbour's (an unreleased episode has no synopsis).
          alignItems: "stretch",
          overflowX: "auto",
          gap: 16,
          // Top padding as well as bottom, and it is load-bearing: `overflow-x`
          // forces the block axis to `auto` too, so this element CLIPS its
          // children vertically. With no top padding the current episode's red
          // ring — which is an outer box-shadow — had its top edge sliced off.
          // It also gives the hover lift somewhere to go.
          padding: "8px 0",
          scrollbarWidth: "none",
          width: "100%",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {episodes.map((ep) => {
          const isCurrent = ep.number === episode;
          // Same "is it aired yet" rule the details page uses. An episode that
          // has not aired carries no still, no runtime and no synopsis, and
          // clicking it used to send the player off to resolve a source that
          // does not exist and land on the fatal banner.
          const aired = isEpAired(ep);
          return (
            <button
              key={ep.number}
              type="button"
              // The selected episode was only marked by a red outline; assistive
              // tech had no idea which one was playing.
              aria-current={isCurrent ? "true" : undefined}
              // Deliberately not `disabled`: a disabled button is unfocusable, so
              // a keyboard or screen-reader user could never discover the card or
              // find out why it will not play. Same call as the details page.
              aria-disabled={aired ? undefined : "true"}
              className="np-episode-card"
              onClick={() => {
                if (!aired) return;
                setResumeOffer(null);
                setPanel(null);
                setBuffering(true);
                onSelectEpisode?.(ep.number);
              }}
              style={{
                flex: "0 0 auto",
                width: IS_TOUCH ? 220 : 260,
                display: "flex",
                flexDirection: "column",
                textAlign: "left",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: aired ? "pointer" : "default",
                // Dimming is CSS-driven (`.np-episode-card` + :hover/:focus-visible);
                // this used to be flipped by writing style.opacity straight from
                // onMouseOver/onMouseOut, which fought React's own style updates.
                opacity: isCurrent ? 1 : aired ? 0.62 : 0.4,
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "16/9",
                  flexShrink: 0,
                  backgroundColor: "#18181b",
                  borderRadius: 8,
                  overflow: "hidden",
                  marginBottom: 10,
                  boxShadow: isCurrent ? `0 0 0 2px ${ACCENT}` : "none",
                }}
              >
                {ep.thumbnailUrl ? (
                  <img
                    src={ep.thumbnailUrl}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      // An unaired episode's still is a placeholder anyway; the
                      // greyscale is what makes the state readable at a glance.
                      filter: aired ? "none" : "grayscale(0.85) brightness(0.6)",
                    }}
                  />
                ) : (
                  /* No still yet: a bare Play glyph advertised an action the card
                     can't take. Numbered plate instead, like the details page. */
                  <div
                    aria-hidden="true"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      width: "100%",
                      height: "100%",
                      color: "rgba(255,255,255,0.28)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 26,
                        fontWeight: 800,
                        lineHeight: 1,
                        color: "rgba(255,255,255,0.5)",
                        fontFamily: "monospace",
                      }}
                    >
                      {String(ep.number).padStart(2, "0")}
                    </span>
                    <IconPlay size={16} />
                  </div>
                )}
                {isCurrent && (
                  <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "#000", fontWeight: 700, fontSize: 13, background: ACCENT, padding: "4px 8px", borderRadius: 4 }}>
                      Now Playing
                    </span>
                  </div>
                )}
                {!aired && (
                  /* "Airs Thu, Sep 9" where the details page shows its green chip,
                     so an unaired episode looks the same on both surfaces. */
                  <span
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      background: "#3c8217",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 600,
                      lineHeight: 1.45,
                      padding: "4px 8px",
                    }}
                  >
                    <IconCalendar size={11} strokeWidth={2} aria-hidden="true" />
                    {formatAirsDate(ep.airDate)}
                  </span>
                )}
                {aired && ep.durationMins ? (
                  <span style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(9,9,11,0.85)", color: "#fff", fontSize: 11, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>
                    {ep.durationMins}m
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  // Pinned so a two-line title can never push the block below it
                  // out of alignment with its neighbours.
                  lineHeight: "20px",
                  height: 20,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {ep.number}. {ep.title || `Episode ${ep.number}`}
              </div>
              {/* Fixed two-line slot. An unaired episode has no synopsis, and
                  leaving this block at its natural 0px height is what made the
                  rail ragged — every such card ended higher than the rest. */}
              <div
                style={{
                  color: "#a1a1aa",
                  fontSize: 12,
                  lineHeight: 1.4,
                  marginTop: 4,
                  minHeight: 34,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  fontStyle: aired ? "normal" : "italic",
                }}
              >
                {ep.description || (aired ? "No synopsis available" : `Airs ${formatAirsDate(ep.airDate)}`)}
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="np-icon-btn"
        aria-label="Close episodes"
        onClick={() => setPanel(null)}
        style={{
          position: "absolute",
          top: 8,
          right: 24,
          background: "rgba(0,0,0,0.5)",
          border: "none",
          borderRadius: "50%",
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          cursor: "pointer",
          zIndex: 7,
        }}
      >
        <IconClose size={18} />
      </button>
    </motion.div>
  );
}