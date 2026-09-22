import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const FadeInSection = React.memo(function FadeInSection({ children, delay = 0, style }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      style={style}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 30 }}
      whileInView={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: reduceMotion ? 0.1 : 0.6, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
});

export default FadeInSection;