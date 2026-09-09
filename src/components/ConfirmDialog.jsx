import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

/**
 * Reusable confirm dialog — replaces window.confirm().
 * Usage:
 *   const { confirmDialog, ConfirmDialogRenderer } = useConfirmDialog();
 *   // In JSX: <ConfirmDialogRenderer />
 *   // Trigger: await confirmDialog({ title, message, confirmLabel?, cancelLabel? })
 */
export function useConfirmDialog() {
  const [queue, setQueue] = useState([]);
  const queueRef = useRef(queue);
  const panelRef = useRef(null);
  queueRef.current = queue;
  const dialog = queue[0] || null;

  // Cleanup: resolve any pending dialog as false on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      queueRef.current.forEach((pending) => pending.resolve(false));
    };
  }, []);

  const confirmDialog = (opts) =>
    new Promise((resolve) => {
      // Queue requests instead of silently orphaning an earlier promise when
      // two destructive actions are triggered before the first is answered.
      setQueue((current) => [...current, { ...opts, resolve }]);
    });

  const handleConfirm = () => {
    queueRef.current[0]?.resolve(true);
    setQueue((current) => current.slice(1));
  };

  const handleCancel = () => {
    queueRef.current[0]?.resolve(false);
    setQueue((current) => current.slice(1));
  };

  useEffect(() => {
    if (!dialog) return;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusInitialControl = () => {
      panelRef.current?.querySelector("[data-dialog-initial]")?.focus();
    };
    const focusTimer = window.setTimeout(focusInitialControl, 0);

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancel();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const controls = [...panelRef.current.querySelectorAll("button:not(:disabled)")];
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

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [dialog]);

  function ConfirmDialogRenderer() {
    return (
      <AnimatePresence>
        {dialog && (
          <>
            {/* Backdrop */}
            <motion.div
              className="modal-overlay"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCancel}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.7)",
                backdropFilter: "blur(4px)",
                zIndex: 10000,
              }}
            />
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 16 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 10001,
                background: "rgba(18, 18, 20, 0.97)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "20px",
                padding: "2rem",
                width: "90%",
                maxWidth: "380px",
                boxShadow:
                  "0 32px 64px -12px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
              className="modal-container"
              ref={panelRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-description"
              tabIndex={-1}
            >
              {/* Icon */}
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ef4444",
                }}
              >
                <AlertTriangle size={22} />
              </div>

              <div>
                <h3
                  id="confirm-dialog-title"
                  style={{
                    margin: "0 0 6px",
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  {dialog.title || "Are you sure?"}
                </h3>
                <p
                  id="confirm-dialog-description"
                  style={{
                    margin: 0,
                    fontSize: "0.9rem",
                    color: "#a1a1aa",
                    lineHeight: 1.5,
                  }}
                >
                  {dialog.message}
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  data-dialog-initial
                  onClick={handleCancel}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#e4e4e7",
                    padding: "10px 20px",
                    borderRadius: "100px",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.12)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.06)")
                  }
                >
                  {dialog.cancelLabel || "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  style={{
                    background: "#ef4444",
                    border: "1px solid #ef4444",
                    color: "#fff",
                    padding: "10px 20px",
                    borderRadius: "100px",
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    boxShadow: "0 4px 14px rgba(239,68,68,0.3)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#dc2626";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#ef4444";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  {dialog.confirmLabel || "Confirm"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  return { confirmDialog, ConfirmDialogRenderer };
}
