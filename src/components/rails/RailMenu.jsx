import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/* ── Rail-head dropdown ───────────────────────────────────────────────────
   The one interactive row head shared by every rail whose subject is
   selectable: "Because you watched <title> ▾" (watch history) and
   "Movies on <provider> ▾" / "TV Series on <provider> ▾" (streaming service).

   When options carry a `logo`, both the frosted trigger pill and every listbox
   option display that brand mark beside the full service name so the "X"
   subject is immediately recognizable and never clips inside a cramped header. */
function RailMenu({
  label,
  valueLabel,
  items,
  activeId,
  onPick,
  ariaLabel,
  inlineLabel = false,
  isUpdating = false,
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const rootRef = useRef(null);
  const anchorRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const restoreFocusRef = useRef(false);
  const focusOptionOnOpenRef = useRef(null);

  // Selection and Escape unmount the panel while focus is inside it, which
  // drops focus to <body>. Flag those closes so the effect below returns focus
  // to the trigger. An outside mousedown does NOT flag: the click owns focus.
  const closeMenu = () => {
    restoreFocusRef.current = true;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    if (anchorRef.current && typeof window !== "undefined") {
      const rect = anchorRef.current.getBoundingClientRect();
      setAlignRight(rect.left + 256 > window.innerWidth - 16);
    }
    if (focusOptionOnOpenRef.current) {
      const target = focusOptionOnOpenRef.current;
      focusOptionOnOpenRef.current = null;
      window.requestAnimationFrame(() => {
        const optionNodes = Array.from(menuRef.current?.querySelectorAll('[role="option"]') || []);
        if (!optionNodes.length) return;
        const activeIdx = Math.max(
          0,
          optionNodes.findIndex((el) => el.getAttribute("aria-selected") === "true"),
        );
        const node = target === "last" ? optionNodes[optionNodes.length - 1] : optionNodes[activeIdx];
        node?.focus();
      });
    }
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

  const handleTriggerKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusOptionOnOpenRef.current = e.key === "ArrowUp" ? "last" : "active";
      setOpen(true);
    }
  };

  const handleMenuKeyDown = (e) => {
    const optionNodes = Array.from(menuRef.current?.querySelectorAll('[role="option"]') || []);
    if (!optionNodes.length) return;
    const currentIndex = optionNodes.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = optionNodes[(currentIndex + 1) % optionNodes.length];
      next?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = optionNodes[(currentIndex - 1 + optionNodes.length) % optionNodes.length];
      prev?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      optionNodes[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      optionNodes[optionNodes.length - 1]?.focus();
    } else if (e.key === "Tab") {
      restoreFocusRef.current = false;
      setOpen(false);
    }
  };

  const options = (items || []).filter(Boolean);
  if (!valueLabel) return null;

  const activeOption = options.find((option) => option.id === activeId) || null;
  const fullLabel = `${label} ${valueLabel}`.trim();
  const hasLogos = options.some((option) => Boolean(option.logo));
  const triggerClass = `rail-menu__trigger${inlineLabel ? " rail-menu__trigger--inline" : ""}${
    activeOption?.logo ? " rail-menu__trigger--with-logo" : ""
  }`;

  // No options to choose between (no watch history yet): render the value as
  // plain text instead of dropping the whole head — the row still needs its
  // title, it just has nothing to switch to.
  if (options.length === 0) {
    return (
      <div className={`rail-menu${inlineLabel ? " rail-menu--inline" : ""}`}>
        <h2 className="rail-menu__label">{label}</h2>
        <span className="rail-menu__value rail-menu__value--static">{valueLabel}</span>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`rail-menu${inlineLabel ? " rail-menu--inline" : ""}${open ? " rail-menu--open" : ""}`}
      data-updating={isUpdating ? "true" : undefined}
    >
      <h2 className="rail-menu__label">{label}</h2>
      <div ref={anchorRef} className="rail-menu__anchor">
        <button
          ref={triggerRef}
          type="button"
          className={triggerClass}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-busy={isUpdating || undefined}
          aria-label={ariaLabel || undefined}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={handleTriggerKeyDown}
        >
          {activeOption?.logo ? (
            <img
              className="rail-menu__trigger-logo"
              src={activeOption.logo}
              alt=""
              aria-hidden="true"
              decoding="async"
              draggable="false"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : null}
          <span className="rail-menu__value">{valueLabel}</span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`rail-menu__chevron${open ? " rail-menu__chevron--open" : ""}`}
          />
        </button>
        {open && (
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel || fullLabel}
            className={`rail-menu__menu discovery-menu${alignRight ? " rail-menu__menu--right" : ""}${
              hasLogos ? " rail-menu__menu--branded" : ""
            }`}
            onKeyDown={handleMenuKeyDown}
          >
            {options.map((option, index) => {
              const isSelected = option.id === activeId;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  style={{ "--opt-i": Math.min(index, 6) }}
                  className={`rail-menu__item${isSelected ? " rail-menu__item--active" : ""}`}
                  onClick={() => {
                    if (!isSelected) onPick(option.id);
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
                  {isSelected ? (
                    <Check size={15} className="rail-menu__check" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default RailMenu;
