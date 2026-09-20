/* ── Menu row inside a filter panel ─────────────────────────────────────── */
function MenuItem({ label, selected, onSelect, icon }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
        selected ? "bg-[#95ff50]/[0.1] text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="flex items-center gap-2 shrink-0 ml-2">
        {icon}
        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />}
      </span>
    </button>
  );
}

export default MenuItem;