import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MotionFade, MotionLeaf } from "../components/MotionLeaf";
import { Keyboard, X, Search, ArrowLeft, Play } from "lucide-react";
import useDialogA11y from "../hooks/useDialogA11y";

export default function GlobalShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if the video player is active (it handles its own shortcuts)
      const playerActive = !!document.querySelector('iframe[src*="cinesrc"], iframe[src*="vidlink"], iframe[src*="vidsrc"], iframe[src*="vidcore"], iframe[src*="peachify"], iframe[src*="vidup"], iframe[src*="smashystream"], iframe[src*="zxcstream"]');
      const target = e.target;
      const isTyping = target instanceof HTMLElement &&
        (target.matches("input, textarea, select") || target.isContentEditable);

      // Shortcuts modal (Shift + ?)
      if (e.shiftKey && e.key === "?" && !isTyping) {
        // Don't open global shortcuts if player is active — player has its own
        if (!playerActive) {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Allow other UI (e.g. the footer hint) to surface the help overlay.
  useEffect(() => {
    const openShortcuts = () => setIsOpen(true);
    window.addEventListener("streamly:open-shortcuts", openShortcuts);
    return () => window.removeEventListener("streamly:open-shortcuts", openShortcuts);
  }, []);

  const shortcuts = [
    { key: "Ctrl / Cmd + K", desc: "Global Search", icon: <Search size={16} /> },
    {
      key: "Shift + ?",
      desc: "Show Keyboard Shortcuts",
      icon: <Keyboard size={16} />,
    },
    { key: "Esc", desc: "Close Modal / Player", icon: <X size={16} /> },
    {
      key: "Space",
      desc: "Play / Pause (In Player)",
      icon: <Play size={16} />,
    },
    {
      key: "Arrows",
      desc: "Navigate Dropdowns",
      icon: <ArrowLeft size={16} style={{ transform: "rotate(180deg)" }} />,
    },
  ];

  // The shortcuts sheet is a modal like any other: Escape closes, Tab stays in
  // the panel, the page behind cannot scroll, and focus returns to whatever
  // opened it (the Shift+? keystroke, the footer hint, or the nav button).
  // This was the third hand-rolled focus trap in the app.
  const panelRef = useRef(null);
  useDialogA11y(isOpen, panelRef, () => setIsOpen(false));

  // Unconditional: the dialog mounts inside `{isOpen && ...}`, so the leaf must
  // be built before the branch, not inside it.
  const L = new MotionLeaf();

  return (
    <AnimatePresence>
      {isOpen && (
        <MotionFade
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: "var(--z-modal-top)",
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setIsOpen(false)}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard Shortcuts"
            tabIndex={-1}
            initial={L.Modal.panel.initial}
            animate={L.Modal.panel.animate}
            exit={L.Modal.panelExit}
            transition={L.Modal.panel.transition}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "450px",
              background: "rgba(24,24,27,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "20px",
              padding: "clamp(1.25rem, 2.5vw, 1.85rem)",
              maxHeight: "min(90vh, 560px)",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
            }}
            className="modal-container shortcuts-panel"
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1.5rem",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.3rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  color: "#fff",
                }}
              >
                <Keyboard size={20} color="var(--accent-secondary, #5ce21c)" />
                Keyboard Shortcuts
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close keyboard shortcuts"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#a1a1aa",
                  cursor: "pointer",
                  display: "flex",
                  padding: "4px",
                  borderRadius: "50%",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#a1a1aa";
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.8rem",
              }}
            >
              {shortcuts.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    background: "rgba(0,0,0,0.4)",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      color: "#d4d4d8",
                      fontSize: "0.95rem",
                    }}
                  >
                    <div style={{ opacity: 0.7 }}>{s.icon}</div>
                    {s.desc}
                  </div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {s.key.split(" + ").map((k, j) => (
                      <span
                        key={j}
                        style={{
                          background: "rgba(255,255,255,0.1)",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          color: "#fff",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p
              style={{
                margin: "1.5rem 0 0",
                textAlign: "center",
                fontSize: "0.8rem",
                color: "#71717a",
              }}
            >
              Press Esc to close
            </p>
          </motion.div>
        </MotionFade>
      )}
    </AnimatePresence>
  );
}
