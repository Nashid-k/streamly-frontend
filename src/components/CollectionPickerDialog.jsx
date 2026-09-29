import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, Globe, Lock, Plus, X } from "lucide-react";
import { useI18n } from "../i18n";

/* ── Collection picker: add/remove ONE title from ANY collection ──────────
   Shared by WatchlistPage (per-card, "Add to / remove from collection") and
   TitleDetailsPage (opens automatically when a newly added title hits a list
   that already has collection folders). */
function CollectionPickerDialog({ open, movie, collections, onToggle, onCreateWithItems, onClose }) {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  // Private by default: publishing a list is a deliberate act everywhere else
  // in the app (it puts the list on the anonymous Explore page), so a create
  // form must never get there by omission.
  const [createVisibility, setCreateVisibility] = useState("private");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setShowCreate(false);
      setCreateName("");
      setCreateVisibility("private");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open || !movie) return null;

  const submitCreate = (e) => {
    e.preventDefault();
    if (!createName.trim()) return;
    onCreateWithItems(createName.trim(), [movie.id], createVisibility);
    setShowCreate(false);
    setCreateName("");
    setCreateVisibility("private");
  };

  // Portaled to <body>: the app wraps every page in a motion.div that keeps a
  // transform on it, which would otherwise break `position: fixed` and push the
  // centered dialog down into the page (forced scrolling to reach it).
  return createPortal(
    <div className="collection-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="collection-dialog collection-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label={`Add "${movie.title}" to a collection`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="collection-dialog__header">
          <h2 className="collection-dialog__title">Add to collection</h2>
          <button
            type="button"
            className="collection-dialog__close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="collection-add__hint">
          Pick a folder for "{movie.title}" — tick to add, untick to remove.
        </p>
        <div className="collection-add__list">
          {collections.length === 0 ? (
            <p className="collection-add__empty">No collections yet — create one below.</p>
          ) : (
            collections.map((collection) => {
              const active = (collection.itemIds || []).includes(movie.id);
              return (
                <button
                  type="button"
                  key={collection.id}
                  className="collection-add__row"
                  aria-pressed={active}
                  onClick={() => onToggle(collection.id, movie.id)}
                >
                  <span className="collection-add__check">
                    {active && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="collection-add__title">{collection.name}</span>
                  <span className="collection-add__meta">
                    {collection.itemIds.length} {collection.itemIds.length === 1 ? "title" : "titles"}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <form onSubmit={submitCreate} className="collection-dialog__form">
          {showCreate ? (
            <>
              <input
                ref={inputRef}
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="New collection name"
                aria-label="New collection name"
                maxLength={60}
                className="collection-dialog__input"
              />
              <div
                className="collection-dialog__visibility"
                role="radiogroup"
                aria-label="Collection visibility"
              >
                <button
                  type="button"
                  role="radio"
                  data-visibility="private"
                  aria-checked={createVisibility === "private"}
                  className="collection-dialog__vis"
                  onClick={() => setCreateVisibility("private")}
                >
                  <Lock size={13} />
                  {t("collections.visibilityPrivate")}
                </button>
                <button
                  type="button"
                  role="radio"
                  data-visibility="public"
                  aria-checked={createVisibility === "public"}
                  className="collection-dialog__vis"
                  onClick={() => setCreateVisibility("public")}
                >
                  <Globe size={13} />
                  {t("collections.visibilityPublic")}
                </button>
              </div>
              <p className="collection-dialog__vis-hint">
                {createVisibility === "public"
                  ? t("collections.visibilityHintPublic")
                  : t("collections.visibilityHintPrivate")}
              </p>
              <div className="collection-dialog__actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!createName.trim()}>
                  Create &amp; add
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="collection-add__create" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> New collection
            </button>
          )}
        </form>
      </div>
    </div>,
    document.body
  );
}

export default CollectionPickerDialog;