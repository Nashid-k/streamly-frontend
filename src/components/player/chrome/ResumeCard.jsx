// Center-screen Resume Watching prompt.
//
// Displayed when the title/episode has a saved watch position. Pauses the video
// and gives the viewer two clear choices on the center of the screen:
//   1. "Resume Watching" (seeks to the saved timestamp and starts playback)
//   2. "Start Over" (starts playback from 0:00)
//
// Follows player-v4 design tokens: dark charcoal background, subtle border,
// smooth spring animation, theme accent, and accessible button semantics.
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SPRING } from "../../../constants/motion";
import { IconPlay } from "./icons";

export default function ResumeCard({ offer, fmtTime, onResume, onRestart }) {
  const reduceMotion = useReducedMotion();
  const resumeBtnRef = useRef(null);

  useEffect(() => {
    if (offer) {
      resumeBtnRef.current?.focus();
    }
  }, [offer]);

  return (
    <AnimatePresence>
      {offer && (
        <div
          className="np-resume-scrim"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "grid",
            placeItems: "center",
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            key="np-resume"
            role="dialog"
            aria-modal="true"
            aria-label={`Resume from ${fmtTime(offer.at)}`}
            className="np-resume-card"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            transition={reduceMotion ? { duration: 0 } : SPRING.LIFT}
            style={{
              width: "min(340px, calc(100% - 32px))",
              background: "#0d1219",
              border: "1px solid #ffffff17",
              borderRadius: "1.25em",
              boxShadow: "0 1em 3em #000c",
              padding: "1.8em 1.5em 1.5em",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              color: "#fff",
            }}
          >
            {/* Accent-tinted play badge */}
            <div
              style={{
                width: "3.2em",
                height: "3.2em",
                borderRadius: "50%",
                background: "color-mix(in srgb, var(--accent, #8652bb) 20%, #121c27)",
                display: "grid",
                placeItems: "center",
                marginBottom: "0.9em",
                color: "var(--accent, #8652bb)",
              }}
            >
              <IconPlay size={24} />
            </div>

            <h3
              style={{
                fontSize: "1.25em",
                fontWeight: 700,
                color: "#fff",
                margin: "0 0 0.35em",
                letterSpacing: "-0.01em",
              }}
            >
              Resume Watching?
            </h3>

            <p
              style={{
                fontSize: "0.92em",
                color: "#8fa3b3",
                margin: "0 0 1.5em",
                lineHeight: 1.45,
              }}
            >
              You left off at <b style={{ color: "#dbe4ec" }}>{fmtTime(offer.at)}</b>. Would you like to continue or start over?
            </p>

            {/* Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6em", width: "100%" }}>
              <button
                ref={resumeBtnRef}
                type="button"
                className="np-resume-btn nxb"
                onClick={() => onResume(offer.at)}
                aria-label={`Resume from ${fmtTime(offer.at)}`}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: ".6em 1em",
                  borderRadius: ".8em",
                  background: "var(--accent, #8652bb)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "1em",
                  border: 0,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5em",
                  transition: "transform .2s var(--ease), filter .2s",
                }}
              >
                <IconPlay size={16} />
                Resume from {fmtTime(offer.at)}
              </button>

              <button
                type="button"
                className="np-restart-btn row"
                onClick={onRestart}
                aria-label="Restart from the beginning"
                style={{
                  width: "100%",
                  minHeight: "42px",
                  padding: ".5em 1em",
                  borderRadius: ".8em",
                  background: "#ffffff12",
                  color: "#b9c6d2",
                  fontWeight: 600,
                  fontSize: ".92em",
                  border: 0,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5em",
                  transition: "background .2s, color .2s, transform .2s",
                }}
              >
                <svg
                  className="ic"
                  style={{ width: "1.2em", height: "1.2em" }}
                  viewBox="0 0 24 24"
                >
                  <use href="#i-rew" />
                </svg>
                Start Over
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
