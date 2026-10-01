import { useOptionalPreferences } from "../../../context/preferences";
import {
  subtitleColor,
  subtitleFontFamily,
  subtitleLang,
  subtitleScrim,
  subtitleSizeScale,
} from "./subtitleStyle";

/**
 * The subtitle cue node (task.md 3.18-3.23).
 *
 * One element, four decisions, and every one of them was a hardcoded value in the
 * legacy:
 *
 *   3.18  font-family   hardcoded to the player's inherited stack
 *   3.19  font-size     `clamp(16px, 2.6vw, 26px)` — a VIEWPORT fraction
 *   3.20  color         hardcoded `#fff`, scrim a fixed `rgba(0,0,0,0.42)`
 *   3.21  lang          absent, so a Tamil cue read in the wrong voice
 *   3.22  bottom        `controlsVisible ? 132 : 64` — a guess at chrome height
 *   3.23  plate         one background box per LINE, via `box-decoration-break`
 *
 * ── On 3.19's unit ────────────────────────────────────────────────────────────
 * `2.6vw` is a fraction of the viewport, so the same cue is tiny on a phone held
 * beside the video and enormous on a 32" monitor even when the player box is
 * identical in both. The scale is applied against `cqi` here, which is the
 * player box, so the cue tracks the thing the viewer is watching.
 *
 * ── On 3.23 ──────────────────────────────────────────────────────────────────
 * The legacy wrapped the cue in a `<span>` with `box-decoration-break: clone`,
 * which paints a background box around every LINE of a wrapped sentence — two
 * boxes for a two-line cue, with a visible notch between them. One plate per cue
 * block is the whole item: `white-space: pre-line` still honours the line breaks
 * the file carries, and the box now wraps the block.
 *
 * @param {object} props
 * @param {string|null} props.cue       the active cue text, or null
 * @param {string} props.language       the track's display name, for `lang`
 * @param {number} props.bottomPx       MEASURED chrome height (see 3.22)
 */
export default function SubtitleOverlay({ cue, language = "", bottomPx = 0 } = {}) {
  const preferences = useOptionalPreferences();

  if (!cue) return null;

  const fontFamily = subtitleFontFamily(preferences?.subtitleFont);
  const scale = subtitleSizeScale(preferences?.subtitleSize);
  const color = subtitleColor(preferences?.subtitleColor);
  const lang = subtitleLang(language);

  return (
    <div
      className="pv2-cue"
      /* 3.22. Measured, not guessed. The legacy used
       * `controlsVisible ? 132 : 64`, which is a pair of literals describing one
       * specific desktop layout: on a narrow player the real transport is taller
       * and a cue sits under it, and on a short viewport 132 clears almost
       * nothing. The shell measures the chrome and passes its height, so the cue
       * sits above the transport at any size — and when the chrome is hidden the
       * measurement shrinks with it, which is the same behaviour the two literals
       * were approximating. */
      style={{
        insetBlockEnd: `${bottomPx}px`,
        fontFamily,
        fontSize: `calc(clamp(14px, 3.1cqi, 34px) * ${scale})`,
        color,
        background: subtitleScrim(color),
      }}
      /* 3.21. Omitted rather than emptied when the language is not confidently
       * mapped: `lang=""` is a claim that the content has no language, which is
       * worse than making no claim at all.
       *
       * On the element and not inside `style` — a spread in the style object puts
       * a `lang` KEY on a CSS declaration, which the CSSOM drops silently, and
       * the cue then renders with no language at all while the code reads as though
       * it had one. */
      {...(lang ? { lang } : {})}
    >
      {cue}
    </div>
  );
}