import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FADE, MODAL_PANEL } from "../../constants/motion";
import { X } from "lucide-react";

/* ── Create / Rename dialog ─────────────────────────────────────────────── */
function CollectionNameDialog({ open, title, initial = "", submitLabel, onSubmit, onClose }) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef(null);

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

  /* Motion: this dialog used to be torn out of the tree the instant `open`
     went false, so it appeared and vanished with no transition while every
     other modal in the product (ConfirmDialog, the auth sheets) arrived on the
     shared shapes. It now takes MODAL_PANEL + FADE from constants/motion, so
     the collections dialogs speak the same motion language as the rest of the
     app and collapse to a cut under prefers-reduced-motion for free.
     The backdrop centres with flexbox (collections.css), never a translate
     transform, so the panel's scale/y animation cannot fight its position. */
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="collection-dialog-backdrop"
          role="presentation"
          onClick={onClose}
          initial={FADE.initial}
          animate={FADE.animate}
          exit={FADE.exit}
          transition={FADE.transition}
        >
          <motion.div
            className="collection-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            initial={MODAL_PANEL.initial}
            animate={MODAL_PANEL.animate}
            exit={MODAL_PANEL.exit}
            transition={MODAL_PANEL.transition}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CollectionNameDialog;