import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Streamly rail/stepper arrow. Legacy call sites render it only when the rail
 * can scroll that way; the 2.0 shell keeps both mounted and lets useRailArrows
 * disable the edge arrow. `.ar.l`/`.ar.r` are the canonical hooks; the
 * `.arrow`/`--*` classes stay for the older rails that still use them.
 */
export default function RailArrow({
  dir,
  onClick,
  disabled,
  revealOnHover = false,
  hoverClass = "group-hover:opacity-100",
  iconSize = 40,
  sideClass,
  className = "",
  // The rail's own name ("Trending Now", "More from Director", …). Without it
  // every arrow on the page exposed the same "Scroll left/right", so a screen
  // reader heard a dozen identical controls. Optional: falls back to the generic
  // name so an un-labelled call site is unchanged, never broken.
  label,
}) {
  const reveal = revealOnHover
    ? `opacity-0 pointer-coarse:opacity-100 ${hoverClass} focus-visible:opacity-100`
    : "";
  const direction = dir === "left" ? "left" : "right";
  // Left undefined on canonical rails so the hook owns `disabled`/`tabIndex`;
  // React must not re-enable an arrow on an unrelated re-render.
  const disabledAttr = disabled === undefined ? {} : { disabled };
  return (
    <button
      type="button"
      onClick={onClick}
      {...disabledAttr}
      aria-label={label ? `${label}: scroll ${direction}` : `Scroll ${direction}`}
      className={`arrow arrow--${dir} ar ${direction === "left" ? "l" : "r"} hidden md:flex items-center justify-center cursor-pointer disabled:cursor-default disabled:opacity-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 ${reveal} ${className}`.trim()}
    >
      {dir === "left" ? (
        <ChevronLeft size={24} strokeWidth={2} />
      ) : (
        <ChevronRight size={24} strokeWidth={2} />
      )}
    </button>
  );
}