import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { DURATION, EASE_OUT } from "../../constants/motion";

/**
 * Reusable settings dropdown (listbox). Replaces the three hand-rolled copies
 * that used to live in SettingsPage. Keeps the ARIA contract the existing
 * dialog/menu tests pin: aria-expanded, aria-haspopup="listbox",
 * role="option", ArrowUp/Down/Home/End, Escape restores focus.
 */
export default function SettingsDropdown({
  label,
  value,
  options,
  onChange,
  triggerClassName,
  menuWidth = "w-44",
  ariaLabel,
  renderTriggerValue,
  open: controlledOpen,
  onOpenChange,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = useCallback((v) => {
    if (isControlled) onOpenChange?.(v);
    else setInternalOpen(v);
  }, [isControlled, onOpenChange]);

  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const wrap = wrapRef.current;
    const handleOutside = (e) => {
      if (wrap && !wrap.contains(e.target)) setOpen(false);
    };
    const handleEscape = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const menu = menuRef.current;
    if (!menu) return undefined;
    const target =
      menu.querySelector('[role="option"][aria-selected="true"]') ||
      menu.querySelector('[role="option"]');
    target?.focus?.();
    return undefined;
  }, [open]);

  const handleMenuKeyDown = (e) => {
    const panel = e.currentTarget;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const opts = [...panel.querySelectorAll('[role="option"]')];
    if (!opts.length) return;
    e.preventDefault();
    const current = opts.indexOf(document.activeElement);
    let next;
    if (e.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % opts.length;
    else if (e.key === "ArrowUp") next = current < 0 ? opts.length - 1 : (current - 1 + opts.length) % opts.length;
    else if (e.key === "Home") next = 0;
    else next = opts.length - 1;
    opts[next]?.focus();
  };

  const selectedOption = options.find((o) => o.value === value);
  const triggerText = renderTriggerValue ? renderTriggerValue(selectedOption) : (selectedOption?.label ?? "");

  const triggerCls =
    triggerClassName ||
    "flex items-center gap-2 px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 backdrop-blur-md group min-w-[160px] justify-between";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel || label}
        onClick={() => setOpen((c) => !c)}
        className={triggerCls}
      >
        <span className="min-w-0 text-sm font-medium text-white/90 truncate">{triggerText}</span>
        <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel || label}
            onKeyDown={handleMenuKeyDown}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: DURATION.FAST, ease: EASE_OUT }}
            className={`absolute right-0 top-full mt-2 ${menuWidth} rounded-2xl p-2 shadow-2xl z-50 flex flex-col gap-1 discovery-menu settings-dropdown`}
          >
            {options.map((opt) => {
              const selected = opt.value === value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    onChange?.(opt.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                    selected ? "settings-dropdown-item is-selected" : "settings-dropdown-item text-white/70 hover:text-white"
                  }`}
                >
                  <span>{opt.label}</span>
                  {selected && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
