import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Canonical Streamly rail/stepper arrow — the episodes-carousel ghost chevron.
 * Transparent 48px hit area with a thin 1.5px chevron, vertically centered
 * over the rail. Call sites render it only when the rail can actually scroll
 * in that direction (see useRailArrows).
 */
export default function RailArrow({
  dir,
  onClick,
  disabled = false,
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label ? `${label}: scroll ${direction}` : `Scroll ${direction}`}
      className={`hidden md:flex absolute top-1/2 -translate-y-1/2 z-40 w-12 h-12 items-center justify-center bg-transparent text-white/80 hover:text-white cursor-pointer transition duration-[var(--anim-hover-time)] ease-[var(--anim-hover-ease)] hover:scale-105 disabled:cursor-default disabled:opacity-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 ${reveal} ${
        sideClass || (dir === "left" ? "left-0" : "right-0")
      } ${className}`.trim()}
    >
      {dir === "left" ? (
        <ChevronLeft size={iconSize} strokeWidth={1.5} />
      ) : (
        <ChevronRight size={iconSize} strokeWidth={1.5} />
      )}
    </button>
  );
}