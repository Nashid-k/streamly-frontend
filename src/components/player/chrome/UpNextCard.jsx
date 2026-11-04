// Up Next post-roll card matching player-v4.html:
// - .nxt container with dark obsidian styling (#0d1219, border, shadow)
// - <small>Up next in <span id="nxc">{seconds}</span>s</small>
// - <b id="nxl">{epLabel}</b>
// - Hairline countdown indicator
// - .nxt-a action buttons: .nxb (Play now) and .nxb.sec (Cancel)
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";

export default function UpNextCard({ upNext, upNextMs, onPlayNow, onCancel }) {
  const M = useMotionTokens(useReducedMotion());
  const seconds = Math.max(1, Math.round(upNextMs / 1000));
  const epLabel = upNext?.title
    ? `E${upNext.number} · ${upNext.title}`
    : `Episode ${upNext?.number}`;

  return (
    <AnimatePresence>
      {upNext && (
        <motion.div
          key="np-upnext"
          id="nxt"
          className="nxt"
          role="complementary"
          aria-label={`Up Next: playing in ${seconds} seconds`}
          initial={M.MODAL_PANEL.initial}
          animate={M.MODAL_PANEL.animate}
          exit={M.MODAL_PANEL.exit}
          transition={M.MODAL_PANEL.transition}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: "max(1em, env(safe-area-inset-right))",
            bottom: "calc(6.4em + env(safe-area-inset-bottom))",
            width: "min(20em, calc(100% - 2em))",
            background: "#0d1219",
            borderRadius: "1.1em",
            border: "1px solid #ffffff17",
            padding: "1em 1.1em",
            zIndex: 6,
            boxShadow: "0 .5em 1.4em #0007",
            display: "flex",
            flexDirection: "column",
            gap: ".7em",
          }}
        >
          <div>
            <small style={{ color: "#8fa3b3", fontSize: "0.88em" }}>
              Up next in <span id="nxc">{seconds}</span>s
            </small>
            <b
              id="nxl"
              style={{
                display: "block",
                marginTop: ".2em",
                color: "#fff",
                fontWeight: 700,
                fontSize: "1.05em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {epLabel}
            </b>
          </div>

          <div
            style={{
              height: 3,
              borderRadius: "999px",
              background: "rgba(255, 255, 255, 0.16)",
              overflow: "hidden",
              margin: ".1em 0",
            }}
          >
            <div
              className="np-upnext-countdown"
              style={{
                height: "100%",
                width: "100%",
                background: "var(--accent, #8652bb)",
                transformOrigin: "left",
                animation: "upNextCountdown linear both",
                animationDuration: `${upNextMs}ms`,
              }}
            />
          </div>

          <div className="nxt-a" style={{ display: "flex", gap: ".6em" }}>
            <button
              type="button"
              className="nxb"
              id="nxgo"
              onClick={() => onPlayNow(upNext.number)}
              style={{
                flex: 1,
                minHeight: 44,
                padding: ".5em 1em",
                borderRadius: ".8em",
                background: "var(--accent, #8652bb)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.95em",
                border: 0,
                cursor: "pointer",
                transition: "transform .2s var(--ease), filter .2s",
              }}
            >
              Play now
            </button>
            <button
              type="button"
              className="nxb sec"
              id="nxno"
              onClick={onCancel}
              style={{
                flex: 1,
                minHeight: 44,
                padding: ".5em 1em",
                borderRadius: ".8em",
                background: "#ffffff1a",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.95em",
                border: 0,
                cursor: "pointer",
                transition: "transform .2s var(--ease), filter .2s",
              }}
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
