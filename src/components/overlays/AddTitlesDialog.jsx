import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MotionFade, MotionLeaf } from "../../components/MotionLeaf";
import { X, Check } from "lucide-react";

/* ── Add-titles picker (from My List) ───────────────────────────────────── */
function AddTitlesDialog({ open, candidates, assignedIds, onConfirm, onClose }) {
  const [checked, setChecked] = useState(() => new Set());
  const L = new MotionLeaf();
  useEffect(() => setChecked(new Set()), [open]);

  const available = candidates.filter((m) => !assignedIds.has(m.id));

  const toggleChecked = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* Same treatment as CollectionNameDialog: shared MotionLeaf so the
     picker collapses to a cut under prefers-reduced-motion. Backdrop centring
     is flexbox, so the panel transform is free. */
  return (
    <AnimatePresence>
      {open && (
        <MotionFade
          className="collection-dialog-backdrop"
          role="presentation"
          onClick={onClose}
        >
          <motion.div
            className="collection-dialog collection-dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-label="Add titles to collection"
            onClick={(e) => e.stopPropagation()}
            initial={L.Modal.panel.initial}
            animate={L.Modal.panel.animate}
            exit={L.Modal.panelExit}
            transition={L.Modal.panel.transition}
          >
        <div className="collection-dialog__header">
          <h2 className="collection-dialog__title">Add titles</h2>
          <button
            type="button"
            className="collection-dialog__close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="collection-add__list">
          {available.length === 0 ? (
            <p className="collection-add__empty">
              Everything from your list is already in this collection.
            </p>
          ) : (
            available.map((m) => {
              const label = m.title || "Untitled";
              return (
                <button
                  type="button"
                  key={m.id}
                  className="collection-add__row"
                  aria-pressed={checked.has(m.id)}
                  onClick={() => toggleChecked(m.id)}
                >
                  <span className="collection-add__check">
                    {checked.has(m.id) && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="collection-add__title">{label}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="collection-dialog__actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={checked.size === 0}
            onClick={() => {
              onConfirm(Array.from(checked));
              setChecked(new Set());
            }}
          >
            Add {checked.size > 0 ? `(${checked.size})` : ""}
          </button>
        </div>
          </motion.div>
      </MotionFade>
      )}
    </AnimatePresence>
  );
}

export default AddTitlesDialog;