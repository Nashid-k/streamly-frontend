import React from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function RailArrow({ dir, onClick }) {
  return (
    <motion.button
      initial={{ opacity: 0.85 }}
      animate={{ opacity: 1 }}
      whileHover={{ scale: 1.08 }}
      onClick={onClick}
      aria-label={dir === "left" ? "Scroll left" : "Scroll right"}
      style={{
        position: "absolute",
        [dir === "left" ? "left" : "right"]: "0px",
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 40,
        background: "rgba(12,12,15,0.9)",
        border: "1px solid rgba(255,255,255,0.16)",
        color: "rgba(255,255,255,0.92)",
        borderRadius: "50%",
        width: "40px",
        height: "40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.6)",
        transition: "background 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s",
      }}
    >
      {dir === "left" ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
    </motion.button>
  );
}
