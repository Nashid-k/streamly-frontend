import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

/* ── Filter pill ──────────────────────────────────────────────────────────
   Frosted capsule that drops a listbox panel. One click-outside / Escape
   listener closes it; the panel renders whatever the caller's children
   function produces so every pill (Genre, Year, Sort, Provider, Country)
   shares the same shell and styling. Shared by the Movies/Series browse
   pages (DiscoveryPage) and My List (WatchlistPage). */
function FilterPill({ label, children }) {
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

  return (
    <div ref={rootRef} className="relative filter-dropdown min-w-0 md:flex-none">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filter by ${label}`}
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center justify-between gap-2 w-full md:w-auto px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md min-w-0 md:min-w-[140px]"
      >
        <span className="truncate text-sm font-medium text-white/80">{label}</span>
        <ChevronDown
          size={14}
          className="w-4 h-4 shrink-0 text-white/50 group-hover:text-white transition-colors"
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="discovery-menu absolute top-[calc(100%+8px)] left-0 z-[70] w-64 max-h-80 overflow-y-auto rounded-2xl border border-white/15 shadow-2xl p-2"
        >
          {children({ close: closeMenu })}
        </div>
      )}
    </div>
  );
}

export default FilterPill;