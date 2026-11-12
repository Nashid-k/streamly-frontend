import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

/* ── Filter pill ──────────────────────────────────────────────────────────
   Frosted capsule that drops a listbox panel. One click-outside / Escape
   listener closes it; the panel renders whatever the caller's children
   function produces so every pill (Genre, Year, Sort, Provider, Country)
   shares the same shell and styling. Shared by the Movies/Series browse
   pages (DiscoveryPage) and My List (WatchlistPage). */
function FilterPill({ label, active = false, children }) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
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
    if (rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      setAlignRight(rect.left + 250 > window.innerWidth);
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

  return (
    <div ref={rootRef} className="relative filter-dropdown min-w-0 md:flex-none">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filter by ${label}`}
        onClick={() => setOpen((o) => !o)}
        className="filter-btn group"
      >
        {active && <span className="dot" />}
        <span className="truncate text-sm font-medium text-white/90">{label}</span>
        <ChevronDown
          size={14}
          className="icon"
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={`discovery-menu absolute top-[calc(100%+8px)] ${
            alignRight ? "right-0" : "left-0"
          } z-[70] w-64 max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto rounded-2xl border border-white/15 shadow-2xl p-2 bg-[#120f1d]/95 backdrop-blur-xl`}
        >
          {children({ close: closeMenu })}
        </div>
      )}
    </div>
  );
}

export default FilterPill;
