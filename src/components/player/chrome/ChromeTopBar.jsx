// The top bar: back button + title/subtitle block.
//
// Extracted so the Apple TV+ re-layout can restyle it (translucent, larger type,
// title that hands off to a sidebar/X-ray) without touching the engine. It owns
// nothing but presentation and the back action; the close policy stays with the
// player via `onBack`.
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useMotionTokens } from "../../../constants/motion";
import IconBtn from "./IconBtn";
import { TEXT_DIM } from "./theme";

export default function ChromeTopBar({ visible, title, subtitle, onBack }) {
  const M = useMotionTokens();
  return (
    <motion.div
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : -20 }}
      transition={M.SPRING.SHEET}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--np-safe-top, 16px) 24px 44px",
        // The bar holds a back button and a title only. A heavier scrim read as a
        // black band over the frame; 0.55 fading out faster keeps the text
        // legible without painting the top third of the picture.
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.22) 45%, rgba(0,0,0,0) 100%)",
        pointerEvents: visible ? "auto" : "none",
        zIndex: 4,
      }}
    >
      <IconBtn label="Back" onClick={onBack}>
        <ArrowLeft size={24} />
      </IconBtn>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          paddingLeft: 12,
          paddingRight: 24,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "clamp(18px, 2.2vw, 23px)",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              color: TEXT_DIM,
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}