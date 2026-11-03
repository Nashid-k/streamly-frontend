/* The scrubber: hover state, drag arbitration, seeking and the frame preview.

   Everything here is one concern — "where does the viewer want to be?" — but
   the expensive part to get wrong was never the drag itself, it was the four
   separate things that all wanted to be the source of truth for the position:

   - The bar follows the POINTER, the head follows the ELEMENT. While dragging,
     the bar must render the pointer (`effectiveRatio`) even though `currentTime`
     is stale, and it must not write `currentTime` per move: every write cancels
     hls.js's in-flight fragment load, so a drag that seeks on every pixel never
     finishes. One seek, on release.
   - The pointer can move faster than the display paints. Each `setScrubHover`
     re-renders the whole player and re-runs the preview decode, so the true
     position is stashed in a ref and applied once per animation frame;
     `onScrubUp` commits the REF, not the last painted frame, or a fast release
     lands on a slightly wrong time.
   - Rapid relative seeks (double-tap spam, held arrow keys) must not fight each
     other. While the element is still seeking, deltas QUEUE and the HUD shows the
     growing queued total, honest about what has not been applied yet. An
     absolute seek (`safeSeek`) drops the queue instead, because applying stale
     deltas afterwards would jump off the target it just set.
   - Every absolute seek in the player goes through `safeSeek`. Direct writes
     scattered around let a stale saved position (resume after a quality switch,
     a media-session seekto, an intro-skip target) land below 0 or past the end
     before `duration` arrived.

   The preview decoder is suppressed — not unmounted — while the player itself
   is fetching, so a hover can never outbid the real fragment for relay bytes. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { previewMetrics } from "../../../constants/playerUi";
import { getPreviewThumb } from "../../../api/previewThumbs";

/**
 * @param {object} input
 * @param {{ current: HTMLVideoElement | null }} input.videoRef
 * @param {() => void} input.poke reveal the chrome.
 * @param {{ current: (kind: string, value?: number) => void }} input.showHudRef
 * @param {{ current: number }} input.skipSecondsRef the viewer's seek amount.
 * @param {object | null} input.resumeOffer a pending "Left off at…" card.
 * @param {(next: object | null) => void} input.setResumeOffer
 * @param {(next: boolean) => void} input.setEnded
 * @param {{ current: object }} input.metaRef current source meta (preview URL).
 * @param {number} input.currentTime
 * @param {number} input.duration
 * @param {number} input.playerW
 * @param {number} input.playerH
 */
export default function useScrubber({
  videoRef,
  poke,
  showHudRef,
  skipSecondsRef,
  resumeOffer,
  setResumeOffer,
  setEnded,
  metaRef,
  currentTime,
  duration,
  playerW,
  playerH,
}) {
  const scrubRef = useRef(null);
  const [scrubHover, setScrubHover] = useState(null); // 0..1 ratio or null
  const [scrubDragging, setScrubDragging] = useState(false);
  // Latest hover position, applied once per animation frame (see the header).
  const scrubHoverLatest = useRef(null);
  const scrubHoverFrame = useRef(0);
  // Pending "drop the hover overlay" deadline; cleared when a NEW scrub starts,
  // or a leftover timer snaps the bar back mid-drag between two gestures.
  const scrubHoverTimer = useRef(null);
  // Deltas queued while a seek is still in flight (see seekRelative).
  const pendingSeekRef = useRef(0);
  // Preview thumbnail: the latest captured frame + a request serial so a fast
  // drag only renders the newest hover position.
  const [previewUrl, setPreviewUrl] = useState(null);
  const previewReqRef = useRef(0);

  // Render-time derivations. `effectiveRatio` is what the bar draws; the head
  // itself only moves when a seek commits.
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progressRatio = safeDuration > 0 ? Math.min(1, Math.max(0, currentTime / safeDuration)) : 0;
  const effectiveRatio = scrubDragging ? (scrubHover ?? progressRatio) : progressRatio;
  const hoverRatio = scrubHover ?? (scrubDragging ? progressRatio : null);
  const previewBox = useMemo(() => previewMetrics(playerW, playerH), [playerW, playerH]);

  const seekTo = useCallback(
    (value) => {
      setEnded(false);
      // Declared below; the ref keeps the two helpers from ordering each other.
      safeSeekRef.current(Number(value) || 0);
    },
    [setEnded],
  );

  /* Single place every absolute seek goes through. Clamps exactly like
     seekRelative's HUD math and swallows the element's range errors. */
  const safeSeek = useCallback(
    (seconds) => {
      const video = videoRef.current;
      if (!video) return;
      // An absolute seek supersedes any relative deltas queued behind an
      // in-flight one — applying them afterwards would jump off the target.
      pendingSeekRef.current = 0;
      const t = Number(seconds);
      if (!Number.isFinite(t)) return;
      const dur = Number(video.duration);
      const clamped = Number.isFinite(dur) && dur > 0 ? Math.min(Math.max(0, t), dur) : Math.max(0, t);
      try {
        video.currentTime = clamped;
      } catch {
        // out-of-range seek — the element clamps; nothing else to do
      }
    },
    [videoRef],
  );
  const safeSeekRef = useRef(safeSeek);
  safeSeekRef.current = safeSeek;

  const seekRelative = useCallback(
    (delta) => {
      const video = videoRef.current;
      if (!video) return;
      poke();
      // Rapid taps (double-tap spam, quick key presses) land while the previous
      // seek is still resolving: writing currentTime again cancels the in-flight
      // fragment load, so nothing ever completes until the viewer stops. Queue
      // those deltas and flush the total once `seeked` fires; the HUD shows the
      // growing queued amount so the feedback stays honest.
      if (video.seeking) {
        pendingSeekRef.current += delta;
        showHudRef.current("seek", pendingSeekRef.current);
        return;
      }
      // HUD shows the amount actually applied (clamped at 0 / duration), not the
      // requested one — YouTube shows +Xs / -Xs, never a lie like -0s.
      const dur = Number(video.duration);
      const from = video.currentTime || 0;
      const next = from + delta;
      const real = Number.isFinite(dur) && dur > 0 ? Math.min(Math.max(0, next), dur) : Math.max(0, next);
      showHudRef.current("seek", real - from);
      try {
        video.currentTime = real;
      } catch {
        // ignore out-of-range seeks
      }
    },
    [videoRef, poke, showHudRef],
  );

  const scrubRatioOf = useCallback((clientX) => {
    const el = scrubRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (!r.width) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  }, []);

  const applyScrubHover = useCallback((ratio) => {
    scrubHoverLatest.current = ratio;
    if (scrubHoverFrame.current) return;
    scrubHoverFrame.current = requestAnimationFrame(() => {
      scrubHoverFrame.current = 0;
      const next = scrubHoverLatest.current;
      if (next !== null) setScrubHover(next);
    });
  }, []);

  const flushScrubHover = useCallback(() => {
    if (scrubHoverFrame.current) {
      cancelAnimationFrame(scrubHoverFrame.current);
      scrubHoverFrame.current = 0;
    }
    if (scrubHoverLatest.current !== null) setScrubHover(scrubHoverLatest.current);
  }, []);

  const clearScrubHover = useCallback(() => {
    if (scrubHoverFrame.current) {
      cancelAnimationFrame(scrubHoverFrame.current);
      scrubHoverFrame.current = 0;
    }
    scrubHoverLatest.current = null;
    setScrubHover(null);
  }, []);

  const onScrubDown = (e) => {
    e.stopPropagation();
    poke();
    if (scrubHoverTimer.current) {
      clearTimeout(scrubHoverTimer.current);
      scrubHoverTimer.current = null;
    }
    if (resumeOffer) setResumeOffer(null); // user grabbed the bar — they pick the spot
    try {
      scrubRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // pointer capture unsupported — drag still works while over the bar
    }
    setScrubDragging(true);
    applyScrubHover(scrubRatioOf(e.clientX));
    // No seek per pointermove: the bar tracks the drag and the seek commits once
    // on release — seeking on every move makes hls.js cancel in-flight fragments.
  };

  const onScrubMove = (e) => {
    applyScrubHover(scrubRatioOf(e.clientX));
    if (scrubDragging) {
      poke(); // a long drag must not let the controls autohide mid-drag
    }
  };

  const onScrubUp = () => {
    poke();
    // Commit the true final pointer position, not the last painted frame.
    const released = scrubHoverLatest.current ?? scrubHover;
    flushScrubHover();
    if (scrubDragging) {
      const dur = Number(videoRef.current?.duration);
      const target = (released ?? 0) * (Number.isFinite(dur) && dur > 0 ? dur : 0);
      seekTo(target);
    }
    setScrubDragging(false);
    // Let the red bar settle on the seek target before dropping the hover overlay.
    scrubHoverTimer.current = window.setTimeout(clearScrubHover, 250);
  };

  // A cancelled gesture (Esc, scroll steal, pointer leaving) must not strand the scrubber.
  const onScrubCancel = () => {
    setScrubDragging(false);
    clearScrubHover();
    if (scrubHoverTimer.current) {
      clearTimeout(scrubHoverTimer.current);
      scrubHoverTimer.current = null;
    }
  };

  const onScrubLeave = () => {
    if (!scrubDragging) clearScrubHover();
    setPreviewUrl(null);
  };

  /* Keyboard seeking. The bar advertises role="slider" + tabIndex, so it has to
     behave like one: arrows nudge, PageUp/Down jump a minute, Home/End slam to
     the ends, and every key reports through the seek HUD so the viewer sees the
     same feedback a drag gives.
     stopPropagation is load-bearing: the window keydown handler also binds
     ArrowLeft/ArrowRight, and without it one press seeks twice.
     Up/Down are deliberately NOT handled here — they fall through to the global
     volume binding, which is the convention this player uses everywhere else
     (and matches YouTube); hijacking them for seeking would make the same key
     mean two different things depending on focus. */
  const onScrubKeyDown = (e) => {
    const dur = Number(videoRef.current?.duration);
    const known = Number.isFinite(dur) && dur > 0;
    let handled = true;
    switch (e.key) {
      case "ArrowLeft":
        // Same auto-repeat guard as the window handler: a held nudge re-targets
        // the seek on every repeat and thrashes the fragment loader.
        if (e.repeat) break;
        seekRelative(-skipSecondsRef.current);
        break;
      case "ArrowRight":
        if (e.repeat) break;
        seekRelative(skipSecondsRef.current);
        break;
      case "PageDown":
        if (e.repeat) break;
        seekRelative(-60);
        break;
      case "PageUp":
        if (e.repeat) break;
        seekRelative(60);
        break;
      case "Home":
        if (known) seekTo(0);
        else handled = false;
        break;
      case "End":
        if (known) seekTo(dur);
        else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  /* Scrubber preview (Netflix/YouTube hover thumbnails): while hovering or
     dragging, decode the frame at the hover position off-screen and show it in
     a small card above the time bubble. Touch included — a drag on the scrubber
     is exactly when a frame preview matters most (there is no hover on mobile).
     The 8s cache + newest-wins queue keeps the relay cost of a drag bounded;
     failures resolve null and scrubbing keeps working, the card just stays
     hidden until a capture lands. */
  useEffect(() => {
    if (hoverRatio == null || safeDuration <= 0) {
      previewReqRef.current += 1; // invalidate any queued capture
      setPreviewUrl(null);
      return undefined;
    }
    const meta = metaRef.current;
    if (!meta?.sourceKey || !meta?.refUrl) return undefined;
    // The preview pipeline mounts per source entry URL: master playlists get
    // the master (the decoder picks its own rendition), per-quality sources
    // get the smooth-start rendition that playback actually uses.
    const target = meta.masterLevels ? meta.entryUrl : meta.refUrl;
    if (!target) return undefined;
    const seconds = Math.min(Math.max(hoverRatio * safeDuration, 0), Math.max(0, safeDuration - 0.5));
    const mine = ++previewReqRef.current;
    let cancelled = false;
    getPreviewThumb({ url: target, refUrl: meta.refUrl, sourceKey: meta.sourceKey, seconds }).then(
      (thumb) => {
        if (!cancelled && thumb && previewReqRef.current === mine) setPreviewUrl(thumb);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverRatio, safeDuration]);

  /* Pending timers / frames on unmount: a leftover rAF writes state into a dead
     component, and a hover deadline would resurrect the overlay. */
  useEffect(
    () => () => {
      if (scrubHoverFrame.current) cancelAnimationFrame(scrubHoverFrame.current);
      if (scrubHoverTimer.current) clearTimeout(scrubHoverTimer.current);
    },
    [],
  );

  return {
    scrubRef,
    scrubHover,
    scrubDragging,
    previewUrl,
    previewBox,
    safeDuration,
    progressRatio,
    effectiveRatio,
    hoverRatio,
    seekTo,
    seekRelative,
    safeSeek,
    pendingSeekRef,
    onScrubDown,
    onScrubMove,
    onScrubUp,
    onScrubCancel,
    onScrubLeave,
    onScrubKeyDown,
  };
}
