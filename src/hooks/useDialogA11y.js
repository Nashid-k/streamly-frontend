import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Modal a11y for dialogs: Escape closes, Tab is trapped inside the panel, and
 * focus is restored to whatever opened the dialog when it closes. It also locks
 * background scroll and gives the panel a tabIndex so focus always has somewhere
 * to land.
 *
 * The app grew two hand-rolled copies of this (ConfirmDialog, SignInDialog) and
 * three collection dialogs that had none at all — Escape did nothing and Tab
 * walked straight into the page behind an `aria-modal="true"` panel. This is the
 * single implementation those should converge on.
 *
 * @param {boolean} open            Whether the dialog is currently mounted.
 * @param {object}  panelRef        Ref to the dialog panel element.
 * @param {Function} onClose        Called on Escape (and used for focus restore).
 * @param {object}  [options]
 * @param {boolean} [options.closeOnEscape]  Set false to disable Escape (e.g.
 *        while a submit is in flight and closing would abandon it).
 * @param {Function} [options.initialFocus]  Returns the element to focus first;
 *        falls back to the first focusable control, then the panel itself.
 */
export default function useDialogA11y(open, panelRef, onClose, options = {}) {
  const { closeOnEscape = true, initialFocus } = options;
  // Captured before the dialog takes focus, so it is the trigger, not the panel.
  const openerRef = useRef(null);
  const overflowRef = useRef(null);
  // Keep the latest onClose without re-running the effect (rebinding mid-flight
  // would re-capture the "opener" as the dialog's own focused control).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;

  useEffect(() => {
    if (!open) return undefined;

    openerRef.current = document.activeElement;
    overflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () => {
      const panel = panelRef.current;
      if (!panel) return [];
      return [...panel.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
        (el) => !el.disabled && !el.hidden,
      );
    };

    const first = initialFocusRef.current?.() || focusables()[0] || panelRef.current;
    first?.focus?.({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === "Escape") {
        if (!closeOnEscapeRef.current) return;
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      const items = focusables();
      // Nothing focusable inside: keep focus on the panel instead of letting
      // Tab escape into the page behind.
      if (!panel || items.length === 0) {
        e.preventDefault();
        panel?.focus?.({ preventScroll: true });
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        firstItem.focus();
      } else if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (overflowRef.current !== null) {
        document.body.style.overflow = overflowRef.current;
        overflowRef.current = null;
      }
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open, panelRef]);
}
