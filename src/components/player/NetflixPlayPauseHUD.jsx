import { memo } from "react";
import { Play, Pause } from "lucide-react";
import { motion } from "framer-motion";
import { SPRING_SNAPPY } from "../../constants/playerUi";

const clamp = (lo, value, hi) => (value < lo ? lo : value > hi ? hi : value);

/* YouTube-style transient play/pause overlay: a big filled glyph, dead centre of
   the frame, that pops on every play/pause toggle and self-fades with the other
   HUDs (the player clears it via the shared hud timer). Presentational only
   (pointer-events none, aria-hidden); `kind` is the NEW state after the toggle
   ("play" | "pause").
   The glyph sits on the picture with NO dark box behind it (an earlier version
   drew a 55%-black squircle, which read as a grey smear over the frame and
   fought bright scenes) — legibility comes from a soft text shadow instead.
   Size derives from the measured frame like every other HUD, so a phone and a
   4K window both read right. */
const NetflixPlayPauseHUD = memo(function NetflixPlayPauseHUD({ kind, metrics }) {
  const scale = metrics?.scale || 1;
  const box = Math.round(clamp(72, 96 * scale, 148));
  const icon = Math.round(clamp(34, 46 * scale, 68));
  const Icon = kind === "pause" ? Pause : Play;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={SPRING_SNAPPY}
      aria-hidden="true"
      data-kind={kind === "pause" ? "pause" : "play"}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 65,
      }}
    >
      <div
        style={{
          width: box,
          height: box,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <motion.span
          initial={{ scale: 0.55, rotate: kind === "play" ? -25 : 0, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={SPRING_SNAPPY}
          style={{ display: "flex", lineHeight: 0 }}
        >
          <Icon
            size={icon}
            color="#fff"
            fill="#fff"
            strokeWidth={0}
            style={{ filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.75))" }}
          />
        </motion.span>
      </div>
    </motion.div>
  );
});

export default NetflixPlayPauseHUD;
