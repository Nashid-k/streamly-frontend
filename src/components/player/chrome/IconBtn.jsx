// Plain circular icon button used by every piece of player chrome.
//
// Extracted verbatim from NativePlayerView so the chrome components share one
// implementation instead of each re-declaring a button. `aria-expanded`/
// `aria-pressed` behaviour is load-bearing: the a11y tests assert the settings
// gear lights up while a sheet is open and reports `aria-expanded`.
import { BTN_SIZE } from "./constants";
import { ACCENT } from "./theme";

export default function IconBtn({ label, onClick, children, active, disabled, expanded, size = BTN_SIZE, ...rest }) {
  return (
    <button
      type="button"
      className="np-icon-btn"
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
        background: active ? "rgba(255,255,255,0.16)" : "transparent",
        color: disabled ? "rgba(255,255,255,0.35)" : ACCENT,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}