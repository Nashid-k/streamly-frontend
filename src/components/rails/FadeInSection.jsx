import React from "react";
import { motion } from "framer-motion";

const FadeInSection = React.memo(function FadeInSection({ children, delay = 0, style }) {
  return (
    <motion.div
      style={style}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
});

export default FadeInSection;