import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MotionFade, MotionLeaf } from "../../components/MotionLeaf";
import { X } from "lucide-react";

/* ── Create / Rename dialog ─────────────────────────────────────────────── */
function CollectionNameDialog({ open, title, initial = "", submitLabel, onSubmit, onClose }) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef(null);
  const L = new MotionLeaf();

  useEffect(() => {
    if (open) {
      setValue(initial);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initial]);

  const submit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
  };

  /* Motion: this dialog uses the shared MotionLeaf so the collection
     dialogs collapse to a cut under prefers-reduced-motion, the same as the
     rest of the app's modal surfaces. The backdrop centres with flexbox
     (collections.css), never a translate transform, so the panel's
     scale/y animation cannot fight its position. */
  return (
    <AnimatePresence>
      {open && (
        <MotionFade
          className="collection-dialog-backdrop"
          role="presentation"
          onClick={onClose}
        >
          <motion.div
            className="collection-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            initial={L.Modal.panel.initial}
            animate={L.Modal.panel.animate}
            exit={L.Modal.panelExit}
            transition={L.Modal.panel.transition}
          >
        <div className="collection-dialog__header">
          <h2 className="collection-dialog__title">{title}</h2>
          <button
            type="button"
            className="collection-dialog__close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="collection-dialog__form">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Collection name"
            aria-label="Collection name"
            maxLength={60}
            className="collection-dialog__input"
          />
          <div className="collection-dialog__actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
              {submitLabel}
            </button>
          </div>
        </form>
          </motion.div>
      </MotionFade>
      )}
    </AnimatePresence>
  );
}

export default CollectionNameDialog;