import { useState, useEffect, useRef } from "react";
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

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
  };

  return (
    <div className="collection-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="collection-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
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
      </div>
    </div>
  );
}

export default CollectionNameDialog;