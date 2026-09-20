/* ── Pill chrome shared across the browse-style actions ─────────────────── */
export const GHOST_PILL =
  "inline-flex items-center gap-2 px-4 md:px-5 py-2 md:py-2.5 rounded-full border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-all duration-300 text-sm font-medium backdrop-blur-md whitespace-nowrap";
export const ACCENT_PILL =
  "inline-flex items-center gap-2 px-4 md:px-5 py-2 md:py-2.5 rounded-full border border-[#95ff50]/40 bg-[#95ff50]/10 text-[#95ff50] hover:bg-[#95ff50]/20 transition-all duration-300 text-sm font-semibold backdrop-blur-md whitespace-nowrap";

/* ── Action button styled as a discovery pill ───────────────────────────── */
function PillAction({ accent, onClick, children, ariaLabel, active }) {
  const cls = accent ? ACCENT_PILL : active ? ACCENT_PILL : GHOST_PILL;
  return (
    <button type="button" aria-label={ariaLabel} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export default PillAction;