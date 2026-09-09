import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, X, Search, ArrowLeft, Play } from "lucide-react";

export default function GlobalShortcuts() {
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(isOpen);
  const previouslyFocusedRef = useRef(null);
  isOpenRef.current = isOpen;

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if the video player is active (it handles its own shortcuts)
      const playerActive = !!document.querySelector('iframe[src*="cinesrc"], iframe[src*="vidlink"], iframe[src*="vidsrc"]');
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

      // Close modal on escape
      if (e.key === "Escape" && isOpenRef.current) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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

  // Trap focus, preserve the trigger, and stop background scrolling while open.
  const modalRef = useRef(null);
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    previouslyFocusedRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = modalRef.current.querySelector('button, [tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();

    const trapFocus = (event) => {
      if (event.key !== "Tab") return;
      const controls = [...modalRef.current.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => {
      window.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocusedRef.current instanceof HTMLElement && previouslyFocusedRef.current.isConnected) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard Shortcuts"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setIsOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "450px",
              background: "rgba(24,24,27,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "20px",
              padding: "2rem",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
            }}
            className="modal-container"
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
                <Keyboard size={20} color="#fb923c" />
                Keyboard Shortcuts
              </h2>
              <button
                onClick={() => setIsOpen(false)}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
