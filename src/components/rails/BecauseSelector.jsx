import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "../../i18n/index.jsx";

/* ── Because-you-watched anchor picker ─────────────────────────────────────
   cinejoy.pk's rail head: the plain label, then the anchor title as a bold
   underlined button with a chevron. Opening it lists every watched title
   (the continue-watching history) as a dark-glass listbox; picking one
   re-bases the rail's recommendations on that title. The interaction shell —
   one click-outside/Escape listener, focus returned to the trigger after a
   keyboard close — mirrors FilterPill so both dropdowns behave identically. */
function BecauseSelector({ anchor, items, onPick }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const restoreFocusRef = useRef(false);

  // Selection and Escape unmount the panel while focus is inside it, which
  // drops focus to <body>. Flag those closes so the effect below returns focus
  // to the trigger. An outside mousedown does NOT flag: the click owns focus.
  const closeMenu = () => {
    restoreFocusRef.current = true;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        restoreFocusRef.current = false;
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [open]);

  const watched = (items || []).filter(Boolean);
  if (!anchor?.title) return null;

  return (
    <div ref={rootRef} className="because-selector">
      <h3 className="because-selector__label">
        {t("home.rails.becauseWatched")}
      </h3>
      <div className="because-selector__anchor">
        <button
          ref={triggerRef}
          type="button"
          className="because-selector__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="because-selector__title">{anchor.title}</span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`because-selector__chevron${open ? " because-selector__chevron--open" : ""}`}
          />
        </button>
        {open && (
          <div
            role="listbox"
            aria-label={t("home.rails.becauseWatched")}
            className="because-selector__menu discovery-menu"
          >
            {watched.map((m) => (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={m.id === anchor.id}
                className={`because-selector__item${m.id === anchor.id ? " because-selector__item--active" : ""}`}
                onClick={() => {
                  if (m.id !== anchor.id) onPick(m.id);
                  closeMenu();
                }}
              >
                {m.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BecauseSelector;
