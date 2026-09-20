import { Search, X } from "lucide-react";

/* ── Frosted capsule search field ───────────────────────────────────────── */
function SearchField({ value, onChange, placeholder }) {
  return (
    <div className="flex items-center gap-2 w-full md:w-64 px-3 md:px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-md transition-all duration-300 focus-within:border-[#95ff50]/40 min-w-0">
      <Search size={14} className="w-4 h-4 shrink-0 text-white/40" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full min-w-0 bg-transparent outline-none text-sm text-white/90 placeholder:text-white/35"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="shrink-0 text-white/50 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default SearchField;