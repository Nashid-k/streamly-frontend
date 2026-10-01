import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimecode, progressFraction } from "./timecode";
import { hoverRatio, hoverSeconds, shouldShowPreview, THUMBNAIL_SETTLE_MS } from "./hoverPreview";
import { getPreviewThumb } from "../../../api/previewThumbs";
import ScrubberBubble from "./ScrubberBubble";
import { boundaryTicks } from "./boundaryTicks";

/**
 * The scrubber (task.md 3.7).
 *
 * ── Scope, stated honestly ──────────────────────────────────────────────────
 * This is the STRUCTURE 3.7 asks the transport to contain: a reachable,
 * labelled, keyboard-operable position control that reports and seeks time.
 * Geometry arrived in 3.13 (the 2px rail, the 6px hover/focus growth, the 14px
 * thumb, all container-scaled); 3.14 adds the single buffered band and 3.15 the
 * hover bubble.
 *
 * ── Why not `<input type="range">` ─────────────────────────────────────────
 * It is tempting, because the browser supplies the keyboard model and the ARIA
 * for free. Three things in this queue rule it out: 3.13 needs a rail that
 * GROWS on hover/focus (a range thumb cannot change its own hit area without a
 * wrapper that fights it), 3.14 needs a buffered band drawn behind the fill
 * inside the track, and 3.15 needs a bubble positioned from one geometry source.
 * A custom `role="slider"` costs a few lines of key handling and buys all three.
 *
 * ── The keyboard model is not optional ─────────────────────────────────────
 * `role="slider"` is a promise: arrow keys move by step, PageUp/PageDown by
 * larger step, Home/End jump to the ends. Getting that wrong is worse than
 * omitting the role, because a screen reader announces "slider" and then nothing
 * responds. Every branch below is asserted in `playerV2Transport.test.jsx`.
 */
const KEY_STEP_SECONDS = 5;
const KEY_PAGE_SECONDS = 30;

function clampSeek(seconds, duration) {
  const total = Number(duration);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(Math.max(0, Number(seconds) || 0), total);
}

/**
 * The playhead's position, as a plain 0-1 number, for the CSS custom property.
 *
 * ── Why a custom property instead of two inline styles ────────────────────────
 * 3.13 gave the scrubber three things positioned from the same fraction: the fill,
 * the thumb, and (in 3.15) the hover bubble. Passing `inlineSize` to one and a
 * `left` to another would make them three numbers that can disagree, and a fill
 * that reaches 50% under a thumb sitting at 47% is the kind of bug that only
 * shows on a slow machine. One number, written once, read by every layer.
 */
const fractionStyle = (fraction, bufferedFractionValue) => ({
  "--pv2-scrub-fraction": fraction,
  "--pv2-scrub-buffered": bufferedFractionValue,
});

/**
 * The buffered extent as a 0-1 fraction of this control's own duration.
 *
 * Guarded twice on purpose. A NaN would drop the `calc()` entirely, which falls
 * the element back to `auto` — full width, so the band would cover the fill and
 * the playhead. And the band must never exceed the fill, or a stale `buffered`
 * left over from a source swap would paint past the end of a shorter title.
 */
function bufferedWidth(buffered, duration) {
  const total = Number(duration);
  const ahead = Number(buffered);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(ahead) || ahead <= 0) return 0;
  return Math.min(1, ahead / total);
}

export default function Scrubber({
  currentTime = 0,
  duration = 0,
  /** 3.14. Seconds of video buffered past the playhead. Passed as SECONDS so the
   *  division happens against the duration this control is rendering with — see
   *  the note where `usePlayerControls` returns it. */
  buffered = 0,
  /** 3.16. Measured boundary record — `{ introEndSeconds, creditsStartSeconds,
   *  source }` — or null. Passed in RAW rather than pre-filtered into ticks so the
   *  estimated-vs-measured decision happens in `boundaryTicks.js`, where the rule
   *  that a guess must never become a permanent mark on the timeline lives. A
   *  caller that pre-filtered here would be one refactor away from painting the
   *  90s heuristic as if it were fact. */
  boundaries = null,
  onSeek,
  /** 3.15 renders the hover bubble from this; wired through now so the
   *  position maths has one home from the start. */
  label = "Seek",
  disabled = false,
  /** 3.15. What the opt-in thumbnail needs to decode a frame: `{ url, refUrl,
   *  sourceKey }` from the resolved source, or null when there is nothing to decode
   *  from. Passed in rather than resolved here so the Scrubber never learns about
   *  source ladders, referer tokens or master playlists — and so the preview
   *  pipeline keeps owning all of that. */
  preview = null,
  /** Which layout this scrubber belongs to (task.md 3.11). Unlike every other
   *  control the scrubber cannot simply be marked absent and left in the flow: it
   *  is `flex: 1 1 auto`, so an invisible one would still eat the entire row width
   *  and push the two thumb clusters into each other. Presence therefore has to
   *  remove it from the tab order here, in addition to the collapse rule in
   *  `player.css`. Always present in the row — it belongs to both tier spines. */
  present = true,
  className = "",
}) {
  const trackRef = useRef(null);
  const fraction = progressFraction(currentTime, duration);
  /* 3.13. The hover/focus growth is the whole point of the item — a 2px rail is
   * nearly invisible on a phone — and `:hover` cannot express half of it: the
   * growth must also happen on keyboard focus, because a keyboard user has no
   * pointer to hover with and would otherwise get a permanently 2px bar.
   *
   * Kept in state rather than left to a CSS `:focus-visible` sibling selector
   * because 3.15's bubble is positioned from the same flag and reads it in JS. */
  const [hovered, setHovered] = useState(false);
  /* Focus counts as live too. `:focus-visible` is deliberately not used as the
   * only signal: jsdom cannot compute focus visibility, so the behaviour would be
   * untestable, and "keyboard focus grows the bar" is a promise worth pinning. */
  const [focused, setFocused] = useState(false);
  const live = hovered || focused;
  /* 3.15. Where the pointer is over the track, as a 0-1 ratio.
   *
   * State rather than a ref because the bubble has to RENDER from it, and the
   * bubble is the only thing in this control that changes position without any
   * media event happening. Kept out of the DOM attributes deliberately: the ratio
   * also has to drive `hoverAnchor`'s clamp in JS, and duplicating it into
   * `--pv2-scrub-fraction` would be a lie — that variable means the PLAYHEAD, and a
   * bubble reading it would show the timecode bubble at the playhead position the
   * instant the pointer moved. */
  const [hoverAt, setHoverAt] = useState(null);
  /* The track's own width, for the clamp. Measured on pointer entry and on resize;
   * the alternative is a percentage clamp, which is precisely the legacy defect in
   * `hoverPreview.js`'s header. */
  const [trackWidth, setTrackWidth] = useState(0);
  /* 3.15's opt-in. False by DEFAULT, which is the item's whole point: the legacy
   * opens a second full HLS session (`previewThumbs.js:107-121`) the moment a
   * pointer lands on the bar, and making it opt-in means a viewer who never asks
   * for art never pays for a decoder. Session-scoped rather than persisted — see
   * the note on the volume/mute persistence debt. */
  const [thumbsWanted, setThumbsWanted] = useState(false);
  /* The art for the hovered position, or null while it is being decoded. Held in
   * the Scrubber rather than fetched in `ScrubberBubble` so the decode is the
   * Scrubber's business and the bubble stays a pure function of props.
   *
   * `null` is the honest "no art yet", and it is what a viewer sees while a decode
   * is in flight — NOT a placeholder rectangle. The bubble is the timecode; the art
   * is an extra, and an empty box where the art will be says "loading" for a thing
   * that may never arrive. */
  const [art, setArt] = useState(null);
  /* One flag: absent means not focusable, not announced and not operable, and it
   * must read as "no range exists" rather than "a range you cannot move". */
  const inert = disabled || !present;

  /** Pointer position -> seconds, measured against the TRACK not the window.
   *  Same reasoning as 3.6: the player is often not the viewport. */
  const measureTrack = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const width = track.getBoundingClientRect()?.width ?? 0;
    // Only a state write when it actually changed. A resize observer fires per
    // frame during a drag-resize, and a bubble that re-renders on every one of them
    // is a bubble that lags the pointer.
    setTrackWidth((previous) => (previous === width ? previous : width));
  }, []);

  /**
   * Pointer position -> the ratio along the track, and the seconds it names.
   *
   * Both computed from `trackRef`'s own rect, which is what 3.17 is about: the
   * legacy computed `hoverRatio * playerW` for the card and a percentage for the
   * bubble, so the two disagreed by the width of the timecodes.
   */
  const trackPointer = useCallback(
    (clientX) => {
      const track = trackRef.current;
      const rect = track?.getBoundingClientRect();
      const ratio = hoverRatio(clientX, rect);
      return { ratio, seconds: hoverSeconds(ratio, duration) };
    },
    [duration],
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (inert) return;
      /* Re-measured here as well as on entry: a pointer move is the one moment the
       * track's rect is guaranteed to be fresh, so this covers a tier change or a
       * rotated device without a second observer. */
      measureTrack();
      const { ratio, seconds } = trackPointer(event.clientX);
      // Quantised so a 1px pointer tremor does not re-render the bubble. One
      // hundredths of the bar is far finer than a viewer can see, and this is the
      // same reasoning as 3.14's `BUFFERED_QUANTUM_SECONDS`.
      setHoverAt((previous) =>
        previous && Math.abs(previous.ratio - ratio) < 0.0001 ? previous : { ratio, seconds },
      );
    },
    [inert, measureTrack, trackPointer],
  );

  const handlePointerLeave = useCallback(() => {
    setHovered(false);
    setHoverAt(null);
    // The art goes with the pointer. A thumbnail left behind after the pointer
    // leaves is a stale promise about a position nobody is looking at.
    setArt(null);
    // `setHovered` listed explicitly. Setters from `useState` are stable, so this
    // changes nothing about when the callback is rebuilt — but the React Compiler
    // infers the dependency set from the body and skips optimizing the component
    // when the two disagree, so an inferred-but-unlisted setter costs the whole
    // component its memoization.
  }, [setHovered]);

  /* `T` toggles the thumbnails. Bound on the scrubber's own keydown rather than
   * globally so it cannot fire while a viewer is typing in a sheet field, and so
   * the viewer has to have the bar focused to arm it — which is also how they
   * discover it, via the hint in the settings sheet (3.24). */
  const handleKeyDown = useCallback(
    (event) => {
      if (inert) return;
      /* The opt-in key, checked before the seek keys because `t` is not one of
       * them and a viewer who presses it must not also trigger a step. */
      if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        event.stopPropagation();
        setThumbsWanted((wanted) => {
          // Turning the opt-in OFF has to also drop the art. Leaving a decoded
          // frame in the bubble after a viewer has said "no thumbnails" means the
          // feature they just disabled is still on screen, still in the DOM, and
          // still being fetched for the next hover.
          if (wanted) setArt(null);
          return !wanted;
        });
        return;
      }
      if (!onSeek) return;
      const total = Number(duration);
      const at = Number(currentTime) || 0;
      let next = null;

      switch (event.key) {
        case "ArrowRight":
        case "ArrowUp":
          next = at + KEY_STEP_SECONDS;
          break;
        case "ArrowLeft":
        case "ArrowDown":
          next = at + KEY_STEP_SECONDS * -1;
          break;
        case "PageUp":
          next = at + KEY_PAGE_SECONDS;
          break;
        case "PageDown":
          next = at + KEY_PAGE_SECONDS * -1;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = total;
          break;
        default:
          return;
      }

      // Only handle the keys we own. Without this, Space and Enter fall through
      // to the document and toggle playback while a viewer is trying to move the
      // playhead with the arrow keys.
      event.preventDefault();
      event.stopPropagation();
      onSeek(clampSeek(next, total));
    },
    [currentTime, inert, duration, onSeek],
  );

  const seekFromClientX = useCallback(
    (clientX) => {
      const track = trackRef.current;
      if (!track || !Number.isFinite(duration) || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      const ratio = (clientX - rect.left) / rect.width;
      return clampSeek(ratio * duration, duration);
    },
    [duration],
  );

  const handlePointerDown = useCallback(
    (event) => {
      if (inert || !onSeek) return;
      // Primary button only. A right-click seek is not a feature, and without
      // this the context menu doubles as a scrubber control.
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      onSeek(seekFromClientX(event.clientX));
    },
    [inert, onSeek, seekFromClientX],
  );


  const known = Number.isFinite(duration) && duration > 0;

  /* 3.15. The opt-in decode.
   *
   * Gated on THREE things, and each is load-bearing:
   *
   *   1. `thumbsWanted` — the item. The legacy opens a second full HLS session the
   *      moment a pointer lands on the bar (`previewThumbs.js:107-121`), so this
   *      being off by default is the whole point of the sub-item.
   *   2. A SETTLE delay. Opt-in alone is opt-in in name only: a viewer who armed it
   *      and then swept the pointer across a title would otherwise open a decoder
   *      per position they passed through. The timecode bubble is unaffected — it
   *      is free to render and is what the item actually asks for on hover.
   *   3. A real `preview` target. Without one there is nothing to decode from, and
   *      a decode attempt that cannot succeed is a failure log on every hover.
   *
   * Newest-wins via a request counter, because the pipeline serialises captures but
   * a sweep outruns it. Without the counter a slow decode for an abandoned position
   * lands after a fast one for the position the viewer is actually on, and the
   * bubble shows art from a spot the pointer left 200ms ago.
   *
   * Newest-wins comes from the effect's own cleanup rather than a request counter —
   * see the note inside. Every failure resolves null inside the pipeline, so this
   * only needs to ignore a rejected promise — which is why the rejection handler
   * exists rather than a bare `() => {}`: a rejected preview must not reach an
   * unhandled rejection and take the console (and a strict-mode test run) with it. */
  useEffect(() => {
    if (!thumbsWanted || !preview || !hoverAt) return undefined;
    const at = hoverAt.seconds;
    // Half a second short of the end: the pipeline's own settle window means a
    // decode at the final frame usually misses, and a preview that never resolves
    // is a preview that never appears.
    const seconds = Math.min(at, Math.max(0, Number(duration) - 0.5));
    if (!Number.isFinite(seconds) || seconds < 0) return undefined;

    let cancelled = false;
    const timer = setTimeout(() => {
      getPreviewThumb({ ...preview, seconds })
        .then((thumb) => {
          // `cancelled` alone is the whole guard. A request counter looks necessary
          // for newest-wins — the pipeline serialises captures, so a sweep genuinely
          // overlaps — but it is redundant here: every new position re-runs this
          // effect, whose cleanup sets `cancelled` on the previous one. An earlier
          // draft carried both, and a probe that removed the counter still passed
          // every test, which is what a second guard that does nothing looks like.
          if (cancelled) return;
          setArt(thumb ? { key: preview.sourceKey, url: thumb } : null);
        })
        .catch(() => {
          /* Never reached for a pipeline failure — `getPreviewThumb` resolves null —
           * but a throw from the module itself, or a test double, must not become an
           * unhandled rejection. There is genuinely nothing to do: the bubble still
           * shows the timecode, which is the part 3.15 promises. */
        });
    }, THUMBNAIL_SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [thumbsWanted, preview, hoverAt, duration]);

  /* A source swap invalidates every decoded frame, and the art is keyed by
   * `sourceKey` rather than CLEARED on a change of it.
   *
   * The obvious implementation is an effect that resets the state when the key
   * moves — which is also the one that briefly shows the OLD title's art on the
   * NEW title before the effect runs, and which fires an extra render on every
   * mount. Reading the key at render is both cheaper and honest: a frame decoded
   * for another source is not a stale preview, it is a preview of the wrong film,
   * so it must not be rendered at all rather than being reset a tick later. */
  const artForThisSource =
    art && preview?.sourceKey != null && art.key === preview.sourceKey ? art.url : null;

  /* Measure the track so `hoverAnchor` can clamp in pixels rather than percent.
   *
   * Observed rather than listened for. A `ResizeObserver` is the tidier-looking
   * answer and it is wrong here: the bubble only exists while the track is live, so
   * observing it means adding an observer and a disconnect on every hover. The bar
   * resizes with the player and with the tier, and both of those already re-render
   * this component — so a measurement on the way in, plus one on every pointer move
   * (where the pointer position has to be read anyway), covers every case the
   * observer would have caught.
   *
   * On a window RESIZE there is no pointer move, which is the one gap, and it is
   * closed by re-measuring on window resize — cheap, once per frame, and only while
   * the bar is live. */
  useEffect(() => {
    if (!live) return undefined;
    measureTrack();
    window.addEventListener("resize", measureTrack);
    return () => window.removeEventListener("resize", measureTrack);
  }, [live, measureTrack]);

  return (
    <div
      ref={trackRef}
      className={`pv2-scrubber ${className}`.trim()}
      /* `role="slider"` with no duration is still focusable and still announced,
       * which is the honest state: the control exists, the range is not known
       * yet. Hard-disabling it here would make it vanish from the tab order
       * during exactly the loading window where a viewer reaches for it. */
      role="slider"
      tabIndex={inert ? -1 : 0}
      /* Same contract as `IconButton`: `inert`, `aria-hidden` and
       * `data-presence` land on the same paint the control goes absent, so there
       * is never a focusable ghost in the tab order. */
      inert={present ? undefined : true}
      aria-hidden={present ? undefined : "true"}
      data-presence={present ? "present" : "absent"}
      /* Drives the 6px growth and 3.15's bubble from CSS. `data-hovered` rather
       * than a class because the stylesheet already keys this player off data
       * attributes (`data-mode`, `data-presence`, `data-state`) and a second
       * naming convention would be a second thing to look up. */
      data-hovered={live ? "true" : "false"}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-label={label}
      aria-valuemin={0}
      /* `aria-valuemax` must be a NUMBER. Passing `duration` while it is NaN
       * makes assistive tech announce "NaN", and passing Infinity is worse. */
      aria-valuemax={known ? duration : 0}
      aria-valuenow={clampSeek(currentTime, duration)}
      aria-valuetext={`${formatTimecode(currentTime)} of ${formatTimecode(duration)}`}
      aria-disabled={inert ? "true" : undefined}
      data-fraction={fraction.toFixed(4)}
      /* The fraction reaches CSS as a NUMBER, not as a percentage string, so the
       * rail, fill, thumb and 3.15's bubble can all compute from it. See
       * `fractionStyle`. */
      style={fractionStyle(fraction, bufferedWidth(buffered, duration))}
      /* The rail's hover/focus growth needs to know the pointer is over it, and
       * `:hover` alone is not enough: the rail is a child, so hovering the dead
       * space between rail and thumb would leave the bar looking asleep. The
       * wrapper already fills the whole hit area, so its own `:hover` is the
       * honest signal. Set in JS rather than left to CSS because 3.15's bubble
       * and the buffered band both read the same flag. */
onPointerEnter={() => setHovered(true)}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      /* 3.15's opt-in is visible on the control, so a viewer can tell whether `T`
       * is armed without having to press it and find out. */
      data-thumbs={thumbsWanted ? "on" : "off"}
    >
      {/* Four layers, absolutely positioned against the wrapper so the rail can
        * grow without reflowing the row (3.13): buffered (3.14), then fill, then
        * the thumb. Rendered in DOM order so the buffered band sits behind and the
        * thumb paints last. */}
      <span className="pv2-scrubber__rail" aria-hidden="true" />
      {/* 3.14. ONE element for the buffered band, drawn behind the fill. The
        * legacy mapped `bufferedRanges` to one div per range — a fresh array every
        * `timeupdate`, four times a second, to draw what reads as a single
        * continuous band. See `bufferedFraction`. */}
      <span className="pv2-scrubber__buffered" aria-hidden="true" />
      <span className="pv2-scrubber__fill" aria-hidden="true" />
      {/* 3.16. Named markers where a MEASURED boundary sits: the end of the intro,
        * the start of the credits. At most two, because that is all `cueBoundaries`
        * holds — there is no chapter list to render here and inventing one would be
        * building a feature nobody asked for out of data that cannot support it.
        *
        * Drawn after the fill so a marker stays visible against the played part of
        * the rail, and `aria-hidden` because the position is already on the slider;
        * announcing two extra values per focus would be noise, not information.
        * `boundaryTicks` refuses an unmeasured record, so the 90s estimate can never
        * reach this element. */}
      {boundaryTicks(boundaries, duration).map((tick) => (
        <span
          key={tick.id}
          className="pv2-scrubber__tick"
          data-kind={tick.kind}
          style={{ left: `${tick.at * 100}%` }}
          aria-hidden="true"
        />
      ))}
      {/* 3.13's 14px thumb. `aria-hidden` because the value is already on the
        * slider itself — announcing it twice would have a screen reader say the
        * position twice per focus. */}
      <span className="pv2-scrubber__thumb" aria-hidden="true" />
      {/* 3.15. The bubble, positioned from `hoverAnchor` — the same clamp the
        * thumbnail card uses, which is 3.17's item discharged rather than deferred.
        *
        * Two ways it can show, and they are not interchangeable. A POINTER gets the
        * position it is over, which is not the playhead: that is the entire point of
        * a hover preview. A KEYBOARD has no pointer, so it gets the playhead — the
        * bubble then restates `aria-valuetext`, which is the only preview a keyboard
        * viewer can get, and the reason the bubble is not merely pointer-only.
        *
        * The timecode is the timecode OF THE POSITION, and it is the only thing
        * shown unless the viewer has pressed `T`. */}
      {shouldShowPreview({ live, duration, inert }) ? (
        <ScrubberBubble
          ratio={hoverAt ? hoverAt.ratio : fraction}
          trackWidth={trackWidth}
          seconds={hoverAt ? hoverAt.seconds : currentTime}
          thumbnail={thumbsWanted ? artForThisSource : null}
        />
      ) : null}
    </div>
  );
}
