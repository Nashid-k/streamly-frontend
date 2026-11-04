// One selectable row in the Source / Audio panels.
//
// The "Pitch" chrome (2026-11) renders these as the reference design's `.opt`
// rows: a slate icon plate on the left, the name in the middle and a filled
// check on the right. The `.np-dialog-row` class is kept because the player's
// menu tests and the selected-row contract key off it; the `.np-opt` class is
// what carries the new geometry.
import { IconChevronRight } from "./icons";

export default function DialogRow({ selected, onClick, title, sub, disabled, icon, hasChevron }) {
  const renderTitle = (t) => {
    if (typeof t !== "string") return t;
    const m = t.match(/^(.*?)\s+(HD|4K)$/);
    if (m) {
      return (
        <>
          {m[1]}
          <sup className="np-opt-tag">{m[2]}</sup>
        </>
      );
    }
    return t;
  };

  return (
    <button
      type="button"
      className={["np-opt", "np-dialog-row", "row", selected ? "sel" : ""].filter(Boolean).join(" ")}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-checked={selected ? "true" : "false"}
      aria-pressed={selected ? "true" : undefined}
    >
      {icon ? <span className="np-opt-ico">{icon}</span> : null}
      <span className="np-opt-name">
        <span className="np-opt-title">{renderTitle(title)}</span>
        {sub && !hasChevron ? <span className="np-opt-sub">{sub}</span> : null}
      </span>
      {hasChevron ? (
        <span className="np-opt-val">
          {sub ? <span>{sub}</span> : null}
          <IconChevronRight size={18} />
        </span>
      ) : (
        <svg className="ic ck"><use href="#i-check" /></svg>
      )}
    </button>
  );
}
