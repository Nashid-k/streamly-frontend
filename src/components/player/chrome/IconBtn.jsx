// Plain circular icon button used by every piece of player chrome.
//
// Extracted verbatim from NativePlayerView so the chrome components share one
// implementation instead of each re-declaring a button. `aria-expanded`/
// `aria-pressed` behaviour is load-bearing: the a11y tests assert the settings
// gear lights up while a sheet is open and reports `aria-expanded`.
//
// The YouTube-style theme (2026-10-08) keeps glyphs white and reserves the red
// accent for played/active marks; a `badge` (the gear's "HD" tag) renders in
// the corner, and `className`/`style` pass through so callers can drop controls
// into pills without losing the shared a11y branch.
import { BTN_SIZE } from "./constants";
import { TEXT } from "./theme";

export default function IconBtn({
  label,
  onClick,
  children,
  active,
  disabled,
  expanded,
  size = BTN_SIZE,
  badge,
  className,
  style,
  ...rest
}) {
  return (
    <button
      type="button"
      className={["np-icon-btn", className].filter(Boolean).join(" ")}
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={expanded ? undefined : active ? true : undefined}
      aria-expanded={expanded === undefined ? undefined : Boolean(expanded)}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick?.(e);
      }}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "none",
        // Active chrome (gear / episodes / subs with a panel open) keeps the SAME
        // dark backdrop as the transport buttons. The old white disc read as an
        // off-palette gray on top of the black pills (user report: "settings btn
        // bg is kind of gray"); the open panel + aria-pressed carry the signal.
        background: "transparent",
        color: disabled ? "rgba(255,255,255,0.35)" : TEXT,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        position: "relative",
        ...style,
      }}
      {...rest}
    >
      {children}
      {badge ? (
        <span className="np-hd-badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  );
}