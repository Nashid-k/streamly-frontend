import { useState, useEffect } from "react";
import { X, Check } from "lucide-react";

/* ── Add-titles picker (from My List) ───────────────────────────────────── */
function AddTitlesDialog({ open, candidates, assignedIds, onConfirm, onClose }) {
  const [checked, setChecked] = useState(() => new Set());
  useEffect(() => setChecked(new Set()), [open]);

  if (!open) return null;
  const available = candidates.filter((m) => !assignedIds.has(m.id));

  const toggleChecked = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="collection-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="collection-dialog collection-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label="Add titles to collection"
        onClick={(e) => e.stopPropagation()}
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
      </div>
    </div>
  );
}

export default AddTitlesDialog;