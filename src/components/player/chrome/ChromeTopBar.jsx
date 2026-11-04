// The top-left title: a bare back arrow and the title.
//
// The "Pitch" chrome (2026-11) drops the floating glass chip: the reference
// design puts a 40px back button and a 26px title straight on the picture, with
// no band or plate behind them. Only the title/back are interactive; the rest of
// the band lets a click reach the picture (it toggles the chrome).
import { IconArrowLeft } from "./icons";

export default function ChromeTopBar({ visible, title, subtitle, onBack }) {
  const label = subtitle ? `${title} · ${subtitle}` : title;
  return (
    <div
      className={["np-topbar", visible ? "" : "np-chrome-hidden"].filter(Boolean).join(" ")}
      inert={!visible}
    >
      <button type="button" className="np-back" aria-label="Back" onClick={onBack}>
        <IconArrowLeft size={30} strokeWidth={2.2} />
      </button>
      <span key={label} className="np-title" title={label}>
        {title}
        {subtitle ? <span className="np-title-sub"> · {subtitle}</span> : null}
      </span>
    </div>
  );
}
