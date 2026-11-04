// Player v4 ChromeTopBar
// Mirrors player-v4.html top bar:
// - .top container with top gradient
// - #back: .btn with .ic.lg (#i-back)
// - #ttl: .title.swap
import PlayerSvgSprite from "./PlayerSvgSprite";

export default function ChromeTopBar({ visible, title, subtitle, onBack }) {
  const label = subtitle ? `${title} · ${subtitle}` : title;
  return (
    <>
      <PlayerSvgSprite />
      <div
        className={["top", !visible ? "np-chrome-hidden" : ""].filter(Boolean).join(" ")}
        inert={!visible}
      >
        <button
          type="button"
          className="btn"
          id="back"
          aria-label="Back"
          onClick={onBack}
        >
          <svg className="ic lg"><use href="#i-back" /></svg>
        </button>
        <span key={label} className="title swap" id="ttl" title={label}>
          {title}
          {subtitle ? (
            <span style={{ fontWeight: 500, color: "rgba(255, 255, 255, 0.82)" }}>
              {" "}· {subtitle}
            </span>
          ) : null}
        </span>
      </div>
    </>
  );
}
