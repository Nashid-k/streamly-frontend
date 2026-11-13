import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/* ── Rail-head dropdown ───────────────────────────────────────────────────
   The one interactive row head shared by every rail whose subject is
   selectable: "Because you watched <title> ▾" (watch history) and
   "Movies on <provider> ▾" / "TV Series on <provider> ▾" (streaming service).

   An item may carry a `logo`; when it does, the option renders that brand mark
   beside the name. The provider rail passes each service's own logo, so the
   open list reads as a brand picker instead of a column of plain words.

   Markup contract: a plain label, then the current value as a bold underlined
   button with a chevron. Opening it lists the options as a dark-glass listbox
   (`.discovery-menu` supplies the panel shell and scrollbar). One
   click-outside/Escape listener, selection and Escape return focus to the
   trigger — the same shell FilterPill uses, so every dropdown behaves alike. */
function RailMenu({ label, valueLabel, items, activeId, onPick, ariaLabel }) {
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

  const options = (items || []).filter(Boolean);
  if (!valueLabel) return null;

  // No options to choose between (no watch history yet): render the value as
  // plain text instead of dropping the whole head — the row still needs its
  // title, it just has nothing to switch to.
  if (options.length === 0) {
    return (
      <div className="rail-menu">
        <h3 className="rail-menu__label">{label}</h3>
        <span className="rail-menu__value rail-menu__value--static">{valueLabel}</span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="rail-menu">
      <h3 className="rail-menu__label">{label}</h3>
      <div className="rail-menu__anchor">
        <button
          ref={triggerRef}
          type="button"
          className="rail-menu__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="rail-menu__value">{valueLabel}</span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`rail-menu__chevron${open ? " rail-menu__chevron--open" : ""}`}
          />
        </button>
        {open && (
          <div role="listbox" aria-label={ariaLabel} className="rail-menu__menu discovery-menu">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === activeId}
                className={`rail-menu__item${option.id === activeId ? " rail-menu__item--active" : ""}`}
                onClick={() => {
                  if (option.id !== activeId) onPick(option.id);
                  closeMenu();
                }}
              >
                {option.logo ? (
                  /* Decorative: the name beside it is the accessible label, and
                     a broken logo must not leave a gap where a brand should be
                     (onError removes the node, the text stays). */
                  <img
                    className="rail-menu__logo"
                    src={option.logo}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
                <span className="rail-menu__item-label">{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default RailMenu;
