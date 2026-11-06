/* Quality switching: pinning a rung, re-resolving the SOURCE ladder, and Auto.

   These three are one concern — "change what is being played without changing
   what is being watched" — and every rule in them exists because a real report
   proved the naive version wrong:

   - OPTIMISTIC HIGHLIGHT, then roll back on EVERY bail-out. A pick flips the
     menu row immediately (on a relay path the probe + playlist trip is seconds,
     and a highlight that stays put reads as "the pick did nothing"), so the two
     early returns — dead probe, no chosen URI — have to undo it too, not just
     the catch.
   - The art stage is only armed AFTER the point of no return. Everything above
     it either returned early or proved the target reachable; blanking the frame
     before that hides working video behind a loader that then just goes away.
   - The resume happens INSIDE the click's activation window. Waiting for the
     first frames before calling play() pushed it past a strict autoplay policy's
     grace, so a quality/audio change left the video paused.
   - A sibling dub is its OWN manifest. When it carries a real ladder the rung is
     pinned in the current manifest; only a genuinely single-rung dub refuses,
     with an honest note, because the old blanket refusal made the viewer switch
     back to Original just to change quality.
   - `isCurrent()` guards every await: a newer pick or a server switch bumps the
     token, and a stale continuation must never write into the new run.

   Behaviour is frozen from the inline version — this is a move, not a rewrite. */

import Hls from "hls.js";
import { logWarn } from "../../../utils/debugLogger";
import { buildQualityRows } from "../nativePlayerHelpers";

export default function useQualitySwitch({
  videoRef,
  hlsRef,
  metaRef,
  switchTokenRef,
  activeDubRef,
  transportRelay,
  activeUri,
  qualities,
  isMasterMode,
  autoUriRef,
  autoUriHeightRef,
  status,
  sourceHeightRef,
  pendingSourceHeightRollbackRef,
  pendingResumeRef,
  safeSeek,
  cancelAudioSwitch,
  armReloadCarry,
  captureFrameUrl,
  poke,
  setBuffering,
  setQualityNote,
  setAutoLevel,
  setManualHeight,
  setActiveUri,
  setStageWhileLoading,
  setServerSwitchStage,
  setSwitchingNote,
  setControlsVisible,
  setCurrentHeight,
  setQualities,
  setSwitchFrame,
  setSourceHeight,
  setPanel,
  setReloadToken,
}) {
const pickQuality = async (uri, height, opts = {}) => {
  const hls = hlsRef.current;
  if (!videoRef.current) return false;
  if (!hls) return false;
  // A sibling dub is its OWN manifest. When that manifest carries a real
  // ladder (RIVO and ZXC dubs are full masters), a rung pick is pinned right
  // here in the CURRENT manifest — the old blanket refusal made the viewer
  // switch back to Original first just to change quality (user report).
  // Only a genuinely single-rung dub cannot change quality without dropping
  // the language, and that keeps an honest note.
  // (Dub switches pass dubSwitch — pickDub commits the ref only after its own
  // probe passed, and picking "Original" clears the ref first.)
  const dubHasLadder =
    Boolean(metaRef.current?.masterLevels) &&
    Array.isArray(hls.levels) &&
    hls.levels.length > 1;
  if (activeDubRef.current > 0 && !opts.dubSwitch && !dubHasLadder) {
    setBuffering(false);
    setQualityNote("This audio track is single-quality — switch to Original to change quality");
    return false;
  }
  // Stamp this pick before any await: a newer pick or a server switch bumps
  // the token, and this continuation must then never write into the new run.
  const myId = (switchTokenRef.current += 1);
  const isCurrent = () => switchTokenRef.current === myId && hlsRef.current === hls;
  const t = videoRef.current.currentTime || 0;
  const wasPaused = videoRef.current.paused;
  // A manual rung pick leaves Auto; the Auto row stays highlighted as the active mode.
  // OPTIMISTIC UI: the menu row and the settings summary flip to the picked
  // rung NOW, before any probe/playlist round trip - on a relay path that
  // wait is measured in seconds, and a highlight that stays put reads as
  // "the pick did nothing". A failed switch rolls both back in the catch.
  if (!opts.auto) {
    setAutoLevel(false);
    if (height != null) setManualHeight(height);
  }
  // The optimistic highlight above must be undone on EVERY bail-out that
  // leaves the old stream playing — not only in the catch. The two early
  // returns below (dead probe, no chosen URI) are plain returns inside the
  // try, so they used to leave the menu row and the settings summary claiming
  // a rung that never loaded.
  const rollbackPick = () => {
    if (!opts.auto) setManualHeight(null);
    setAutoLevel(opts.auto ? true : metaRef.current?.masterLevels ? true : false);
  };
  // pickDub already said "Audio -> <track>…" — don't overwrite it with "?p".
  setBuffering(true);
  poke();
  try {
    // A dub switch on a multi-rung master replaces the whole playlist (the dub
    // is a sibling master URL), so it must NOT be short-circuited into
    // `hls.currentLevel` — that would keep the original language playing.
    // An `external` pick carries a URI from a DIFFERENT master (the
    // vidrack upgrade): pinning a level inside the CURRENT manifest
    // would silently do nothing, so it must take the full loadSource path.
    if (!opts.dubSwitch && !opts.external && metaRef.current?.masterLevels && Array.isArray(hls.levels) && hls.levels.length > 0) {
      let best = 0;
      hls.levels.forEach((lvl, i) => {
        if (Math.abs((lvl.height || 0) - (height || 0)) < Math.abs((hls.levels[best].height || 0) - (height || 0))) best = i;
      });
      hls.currentLevel = best;
      setAutoLevel(false);
      // Highlight the ROW the viewer clicked, not the manifest rung hls.js
      // pinned to it. A coarse manifest ladder (or a resolver that reports
      // different pixel heights than EXT-X-STREAM-INF RESOLUTION) lands on a
      // DIFFERENT rung than the clicked label; keying manualHeight on the
      // manifest height left NO row selected after the pick.
      if (height != null) setManualHeight(height);
      setActiveUri(null);
      setBuffering(false);
      setStageWhileLoading(false);
      setSwitchingNote(null);
      setQualityNote(null);
      return true;
    }
    // Pre-warm the swap: probe the TARGET while the current level still plays (warms
    // the CDN edge and proves the route). With parallel range chunking a tall pick
    // may try; the floor step-down negotiates back down.
    let chosenUri = uri;
    let chosenHeight = height;
    // Relay transport already proved itself at open, and a dub switch's
    // pickDub probed this exact URI seconds ago — re-probing both is what
    // made audio/quality swaps hang for seconds before anything moved
    // (user report). The real gate below (loadSource + canplay) still fails
    // honestly if the target is dead.
    let warm = transportRelay || opts.preProbed ? { ok: true, via: "pre-checked" } : null;
    const refUrl = metaRef.current?.refUrl;
    try {
      if (!warm) warm = await probeSourcePlayable(uri, refUrl);
      if (!isCurrent()) return false;
      if (!warm.ok) {
        rollbackPick();
        setBuffering(false);
        setStageWhileLoading(false);
        setSwitchingNote(null);
        setControlsVisible(true);
        return false;
      }
    } catch {
      // probe hiccup (abort, timeout) — fall through to the requested uri
    }
    if (!isCurrent()) return false;
    // A probe hiccup with no requested uri would reach loadSource(undefined)
    // → the worker's ?url=undefined 500. Bail to the current quality instead.
    if (!chosenUri) {
      rollbackPick();
      setBuffering(false);
      setStageWhileLoading(false);
      setSwitchingNote(null);
      setControlsVisible(true);
      return false;
    }
    if (chosenUri === activeUri) {
      setBuffering(false);
      setStageWhileLoading(false);
      setSwitchingNote(null);
      setControlsVisible(true);
      return true;
    }
    // The picture is about to go black for real: everything above either
    // returned early (probe failed, same URI, pinned level) or proved the
    // target reachable. Only now is it honest to hide the old frame behind
    // the art stage — a viewer staring at a frozen frame during the reload
    // has no idea whether it stalled. The in-manifest shortcut above is
    // deliberately NOT armed: it never drops the frame, so it must not blank
    // the player either.
    // A whole new manifest invalidates a pending in-manifest audio switch:
    // its tracks/listeners belong to the old playlist.
    cancelAudioSwitch();
    setStageWhileLoading(true);
    setServerSwitchStage(false);
    setSwitchingNote(
      opts.dubSwitch
        ? "Switching audio…"
        : `Switching to ${chosenHeight || "?"}p…`,
    );
    hls.loadSource(chosenUri);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("switch timed out")), 30000);
      const onFatal = (_e, data) => {
        if (data?.fatal) reject(new Error(data?.details || "playlist switch failed"));
      };
      const done = () => {
        clearTimeout(timer);
        hls.off(Hls.Events.MANIFEST_PARSED, done);
        hls.off(Hls.Events.ERROR, onFatal);
        resolve();
      };
      hls.on(Hls.Events.MANIFEST_PARSED, done);
      hls.on(Hls.Events.ERROR, onFatal);
    });
    if (!isCurrent()) return false;
    // Start the NEW manifest at the resume position. hls.js otherwise buffers
    // from the first fragment and only then follows the element's seek, so a
    // switch deep into a film paid a whole fragment fetch (and a seek round
    // trip) for frames nobody ever saw. startLoad(position) is the documented
    // way to set a start position on an engine that is already loaded.
    const startAt = Number(t);
    if (Number.isFinite(startAt) && startAt > 0 && typeof hls.startLoad === "function") {
      try {
        hls.startLoad(startAt);
      } catch (error) {
        logWarn("native", "hls.startLoad at the resume position was refused; seeking instead.", {
          position: startAt,
          message: error?.message,
        });
      }
    }
    safeSeek(t);
    const video = videoRef.current;
    // Resume INSIDE the click's activation window: start the play() NOW, before
    // the canplay wait below. Waiting for the first frames first (the previous
    // order) pushed play() past the activation a strict autoplay policy grants,
    // so an audio/quality change left the video paused until the viewer pressed
    // play (user report). The bounded wait below is now only for the art stage,
    // never a gate on the resume.
    const resumePlay =
      !wasPaused && video
        ? Promise.resolve(video.play()).catch((error) => {
            // Never swallow it: say so in the log and arm a one-shot resume so
            // the next interaction still starts playback.
            logWarn("native", "Browser refused the post-switch auto-resume; playback starts on the next tap.", {
              url: String(chosenUri).slice(0, 80),
              code: error?.name || String(error),
            });
            pendingResumeRef.current = true;
          })
        : null;
    if (!wasPaused && video && (video.readyState ?? 0) < 3) {
      let settleFrame;
      let frameTimer;
      function cleanup() {
        video.removeEventListener("canplay", onFrame);
        video.removeEventListener("loadeddata", onFrame);
        clearTimeout(frameTimer);
      }
      function onFrame() {
        cleanup();
        settleFrame?.();
      }
      await new Promise((resolve) => {
        settleFrame = resolve;
        video.addEventListener("canplay", onFrame);
        video.addEventListener("loadeddata", onFrame);
        // The timeout must ALSO detach: previously cleanup() ran only on the
        // frame event, so every audio/quality switch where the frame missed the
        // 4s window left a dead canplay/loadeddata pair (and its timer) behind.
        frameTimer = setTimeout(() => {
          cleanup();
          resolve();
        }, 4000);
      });
    }
    if (!isCurrent()) return false;
    if (resumePlay) await resumePlay;
    setActiveUri(chosenUri);
    // The full-reload path never sees LEVEL_SWITCHED's height when the new
    // media playlist carries NO RESOLUTION (a heightless level reports 0),
    // which drove Auto's "Now" line and the HD chip to "0p". Seed currentHeight
    // from the picked rung; LEVEL_SWITCHED still overrides it with a real one.
    if (chosenHeight != null) setCurrentHeight(chosenHeight);
    // A swapped source can bring its OWN ladder (external upgrade, sibling
    // master): refresh the menu from what actually parsed, but only for a real
    // multi-rung ladder — a single heightless media level must never clobber
    // the resolver ladder the rows were built from.
    if (hls && Array.isArray(hls.levels) && hls.levels.length > 1) {
      const parsed = hls.levels.filter((l) => (l.height || 0) > 0);
      if (parsed.length > 1 && parsed.length !== qualities.length) {
        setQualities(
          buildQualityRows(
            parsed.map((l) => ({
              uri: chosenUri,
              width: l.width || 0,
              height: l.height || 0,
              bandwidth: l.bitrate || l.bandwidth || 0,
            })),
          ),
        );
      }
    }
    setQualityNote(null);
    // A dub switch has no quality to report — pickDub already announced the
    // track it is moving to, so don't overwrite it with "?p".
    // Real frames again. The loader's own success path clears this too, but a
    // direct hls.loadSource() swap (quality/dub) never goes through that path,
    // so without this the art stage would sit on top of working video.
    setStageWhileLoading(false);
    setSwitchingNote(null);
    return true;
  } catch {
    // A superseded pick owns nothing on screen: the newer action (or server
    // switch) has already set its own highlight/stage. Writing here would roll
    // back the NEW pick and clear the NEW loader.
    if (!isCurrent()) return false;
    // Roll the optimistic pick back: the stream is still on the old rung, so
    // the highlight must say so.
    rollbackPick();
    // A failed switch must never leave the buffering spinner stuck (the runSource
    // ERROR handler's failover re-drives its own spinner).
    setBuffering(false);
    // Nor the art stage: the old picture is still there and still correct, so
    // the viewer gets their frame back immediately instead of a stuck overlay.
    setStageWhileLoading(false);
    setSwitchingNote(null);
    return false;
  }
};
const pickSourceQuality = (height) => {
  const next = Number(height) > 0 ? Number(height) : 0;
  // Same-key is a no-op while that ladder is live, but after a fatal it is the
  // viewer's retry for the exact rung they picked.
  if ((sourceHeightRef.current || 0) === next && status !== "error") return;
  // A source-quality pick re-runs the whole stream: invalidate any quality/dub
  // continuation still parked on the old manifest.
  switchTokenRef.current += 1;
  cancelAudioSwitch();
  // Remember the last working ladder for the failure path (only when this is
  // an actual change, so a same-rung retry doesn't roll back to itself).
  if ((sourceHeightRef.current || 0) !== next) {
    pendingSourceHeightRollbackRef.current = sourceHeightRef.current || 0;
  }
  // Same reload carry as pickServer: this rides the same teardown path, so
  // without it a mid-film source-quality change also restarted at 0.
  armReloadCarry();
  setSwitchFrame(captureFrameUrl());
  sourceHeightRef.current = next;
  setSourceHeight(next);
  setPanel(null);
  // A source re-resolve has no valid frame to keep, so it is a cold wait.
  setStageWhileLoading(true);
  setServerSwitchStage(true);
  setSwitchingNote(next ? `Switching source to ${next}p…` : "Switching source quality…");
  setBuffering(true);
  poke();
  setReloadToken((t) => t + 1);
};

const pickAuto = () => {
  const hls = hlsRef.current;
  const autoUri = autoUriRef.current;
  const autoHeight = autoUriHeightRef.current;
  if (
    isMasterMode &&
    hls &&
    Array.isArray(hls.levels) &&
    hls.levels.length > 0
  ) {
    // Master: hand level selection back to hls.js ABR.
    hls.currentLevel = -1;
    setActiveUri(null);
  } else if (!isMasterMode && autoUri && autoUri !== activeUri) {
    // Non-master "Auto" = the rung negotiated at settle, applied live but never pinned.
    pickQuality(autoUri, autoHeight ?? null, { auto: true });
  }
  setAutoLevel(true);
  setManualHeight(null);
  poke();
};


  return { pickQuality, pickSourceQuality, pickAuto };
}
