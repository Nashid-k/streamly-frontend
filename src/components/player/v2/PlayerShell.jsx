import { forwardRef, useCallback, useMemo, useRef, useState } from "react";
/* v2's own stylesheet. This import is load-bearing and was missing, which is why
 * the player rendered unstyled: every v2 CSS test read this file off DISK and
 * happily asserted its rules while the browser never received a byte of it.
 * `styles/player.css` in main.jsx is the LEGACY sheet and does not style a
 * `.pv2-shell`. Pinned by playerV2StylesheetWiring.test.js so it cannot go again. */
import "./player.css";
import LoadingStage from "./LoadingStage";
import PlayerVideo from "./PlayerVideo";
import StatusLine from "./StatusLine";
import TransportBar from "./TransportBar";
import VolumeIndicator from "./VolumeIndicator";
import useVolumeGesture from "./hooks/useVolumeGesture";
import usePlaybackState from "./hooks/usePlaybackState";
import usePlaybackStatus from "./hooks/usePlaybackStatus";
import useChromeAutoHide from "./hooks/useChromeAutoHide";
import usePlayerControls from "./hooks/usePlayerControls";
import usePlayerPrefs from "./hooks/usePlayerPrefs";
import usePlayerSource from "./hooks/usePlayerSource";
import useSkipBoundaries from "./hooks/useSkipBoundaries";
import usePlayerSubtitles from "./hooks/usePlayerSubtitles";
import useAudioTracks from "./hooks/useAudioTracks";
import useHistoryBack from "./hooks/useHistoryBack";
import useChromeHeight from "./hooks/useChromeHeight";
import SubtitleOverlay from "./SubtitleOverlay";
import useTier from "./hooks/useTier";
import useInputCapability from "./hooks/useInputCapability";
import { TRANSPORT_MODE } from "./tiers";
import { nextPanelId } from "./sheetPanels";
import SettingsSheet from "./SettingsSheet";
import { previewTarget } from "./hoverPreview";
import { E, S, selectView } from "./playbackMachine";
import { playerOpenAttrs } from "../../../utils/playerOpen";

/**
 * PLAYER V2 shell — Phase 1 (task.md 6.2).
 *
 * ============================================================================
 * INVENTORY: ../v2/INVENTORY.md is the authoritative KEEP/DELETE list. The two
 * loader KEEPs (blurred backdrop art, centred poster logo, no-logo fallback,
 * and the `role="status"` live region) live in ./LoadingStage; the DELETE list
 * is what Phase 6 removes. Do not add a `../Loader` import here or in any v2
 * file — that component is app-wide and stays untouched (guarded by
 * playerV2Structure.test.js).
 * ============================================================================
 *
 * COMPOSES ONLY (task.md 2.5): no playback logic, no geometry math, no source
 * resolution. This component's entire job right now is to own the playback
 * state, hand it to the loading stage, and stamp the overlay contract. When
 * `PlayerVideo` lands (Phase 2, task.md 6.3) it slots in here without this file
 * changing shape — deliberately, so the Phase 1 loader can be reviewed on its
 * own before any video is attached to it.
 *
 * ── Prop contract FROZEN (task.md 2.3) ────────────────────────────────────
 * Transcribed verbatim from `NativePlayerView.jsx:726-761`. Every prop the
 * details page passes today must keep working, because the new player is
 * mounted by the same parent and the flag fallback must remain a drop-in
 * replacement. Renaming a prop here would silently disable a feature in one
 * branch only — the worst kind of bug, since both branches would "work".
 *
 * `ref` forwards to the shell root, which is what TitleDetailsPage's overlay
 * attribute currently stamps. Forwarded rather than accepted as a prop so the
 * public contract stays identical to the old component's.
 */
const PlayerShell = forwardRef(function PlayerShell(
  {
    type = "movie",
    id,
    season = 1,
    episode = 1,
    title,
    subtitle,
    /** IMDb id ({imdbId}/{imdb_id} from TMDB) for OpenSubtitles lookups; optional. */
    imdbId = "",
    /**
     * Title artwork for the loading stage. Optional: without it the stage falls
     * back to a plain scrim, and a missing backdrop must never be the reason a
     * load looks broken.
     */
    backdropUrl = "",
    /**
     * The title IMAGE centred inside the loading stage (the TMDB logo when the
     * page has one), distinct from backdropUrl, which is the blurred
     * full-screen ambience behind it.
     */
    posterUrl = "",
    episodes = [],
    onSelectEpisode,
    /**
     * Netflix-style prev/next episode paging. The parent owns navigation (it can
     * cross season boundaries), so without its canGoPrev/onGoPrev pair we walk
     * the local `episodes` list instead.
     */
    canGoPrev,
    canGoNext,
    onGoPrev,
    onGoNext,
    onClose,
    /** Continue-watching entry for this title/episode ({ timestamp } in s, >0) + progress sink. */
    watchedEntry,
    onProgressChange,
    /** TMDB original_language — the only language signal the sources give us. */
    originalLanguage = "",
    /**
     * Watch Party controller from TitleDetailsPage (the useWatchParty result).
     * Null = solo playback. Present = the host broadcasts / guests follow.
     */
    party = null,
    /** Honours the viewer's reduced-motion preference (2.7 + INVENTORY). */
    reduceMotion = false,
  },
  ref,
) {
  /**
   * Mounting the shell IS a load request — the viewer opened a title and asked
   * for it. So the machine starts at `resolving`, not `idle`, and the loading
   * stage is visible from the first frame.
   *
   * `idle` would be the wrong entry state: it means "nobody has asked for
   * anything", and `showLoader` is correctly false there, so the player would
   * mount showing an empty shell with no loader and no announcement — a load
   * that looks frozen from its very first paint. Stating the truth up front is
   * also why this is an initial state rather than a mount effect: no dispatch,
   * no effect, and no first-paint flash of the wrong thing.
   *
   * PlayerVideo's media events take over from here in Phase 2 (task.md 6.3).
   * The alternative — faking transitions so the loader animates — would make the
   * state machine a decoration instead of a contract.
   */
  const { state, showLoader, announcement, rev, send } = usePlaybackState({
    state: S.RESOLVING,
    error: null,
    rev: 0,
  });

  /* ── Element handles (task.md 3.7) ──────────────────────────────────────────
   * Two refs, merged onto one node. The forwarded `ref` belongs to
   * TitleDetailsPage (overlay attributes) and must keep working untouched; the
   * shell's own handle is what fullscreen needs and what `usePlayerControls`
   * drives. A local object ref is NOT enough for the forwarded case, so both
   * are set from one callback — silently dropping one of them would look fine
   * here and break either the overlay or fullscreen much later. */
  const shellRef = useRef(null);
  const setShellNode = useCallback(
    (node) => {
      shellRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const videoRef = useRef(null);
  /* The live hls.js engine (task.md R4.1/R4.7), reported by `useHlsSource` and
   * read by `useAudioTracks`. Deliberately STATE, not a ref: the panel reads it
   * to build its track model, so it has to be a render input. The earlier ref was
   * written by a child effect and read during render, which meant the panel always
   * saw the previous value — null on every source — and bound to nothing (R4.7).
   * The cost is one extra re-render per source change, and the settings sheet is
   * plain state that survives it; the reasoning that said otherwise was wrong. */
  const [engine, setEngine] = useState(null);
  const { audio, selectAudio } = useAudioTracks(engine);
  /* The element ALSO as state (task.md 3.9, fixing 3.7).
   *
   * A ref alone cannot be an effect dependency, and the effects that need the
   * element — the media-element subscription, the playbackRate write — all
   * mounted while `url` was still empty and found nothing there. Depending on
   * this instead of the ref means they re-run exactly when the element appears
   * or is replaced by a new one. The ref stays for imperative reads, which
   * want `.current` at call time and must not re-subscribe. */
  const [videoNode, setVideoNode] = useState(null);
  const attachVideo = useCallback((node) => {
    videoRef.current = node;
    setVideoNode(node);
  }, []);

  const controls = usePlayerControls(videoRef, shellRef, videoNode);
  const prefs = usePlayerPrefs({ videoNode });

  /** Which settings panel is open, if any. 3.24 renders the sheet from this;
   *  until then the transport's sheet openers have a real target to report and
   *  nothing draws, which is honest rather than a dead button. */
const [sheetPanel, setSheetPanel] = useState(null);
  /* Toggle, don't just open (task.md 3.24). Pressing the openers's own button again
   * closes the sheet, which is the one dismissal available before 3.25's backdrop
   * and Escape land — without it the sheet is a one-way door.
   *
   * An unknown id is refused by `nextPanelId`, so a control that is not in
   * `SHEET_PANELS` cannot leave the sheet in a state that renders nothing. */
  const openSheet = useCallback(
    (panelId) => setSheetPanel((current) => nextPanelId(current, panelId)),
    [],
  );
  const closeSheet = useCallback(() => setSheetPanel(null), []);

  /* ── Escape closes the player (task.md 3.25, the "only then" half) ───────────
   *
   * On the shell root, NOT on `window`. That is what makes the ordering work:
   * React's synthetic propagation runs from the sheet upward, so the sheet's own
   * handler calls `stopPropagation()` first and this one never runs for that same
   * keypress. The ordering is therefore structural rather than a `setTimeout(0)`
   * or a "close the sheet first, then check" dance — which would be a race
   * between two handlers that both decided to close something.
   *
   * A `window` listener would be wrong in a way that is easy to miss: the event has
   * already bubbled past the shell by the time it arrives, so `stopPropagation` in
   * the sheet could not prevent it and both layers would close on one Escape.
   *
   * Fullscreen is the exception, copied from the legacy (`NativePlayerView.jsx:2158`):
   * the BROWSER consumes Escape to leave fullscreen, so the key never reaches us as
   * a usable signal. Closing the player as well would mean a viewer who pressed
   * Escape to get out of fullscreen also lost their place — the opposite of what
   * they asked for.
   */
  const handleShellKeyDown = useCallback(
    (event) => {
      if (event.key !== "Escape") return;
      if (typeof document !== "undefined" && document.fullscreenElement) return;
      onClose?.();
    },
    [onClose],
  );

  /* Back closes the player too (task.md 3.38). Placed beside Escape because it is
   * the same intent — leave the player, not the page — reached by a different
   * control. */
  useHistoryBack({ onBack: onClose });

  /* Idle auto-hide (task.md 3.8). The timer only ever runs while the machine
   * says we are actually playing, so this cannot hide the controls off a paused,
   * ended, errored or still-loading player. */
  const { visible: chromeVisible, poke } = useChromeAutoHide({
    state,
    containerRef: shellRef,
    sheetOpen: sheetPanel != null,
  });

  /* Which transport tier (task.md 3.9). "Engaged" is deliberately the CHROME's
   * own answer rather than a second set of pointer/focus listeners: 3.8 already
   * answers "is the viewer interacting, or has playback stopped needing them",
   * and asking that question twice with two sets of listeners is how two
   * timelines drift apart. */
  const tier = useTier({ containerRef: shellRef, engaged: chromeVisible });
  /* task.md 3.11. Consumed by the transport's layout mode; see the note at the
   * `TransportBar` call site for why this is live rather than read once. */
  const input = useInputCapability();

  /* ── Touch volume (task.md 3.12) ────────────────────────────────────────────
   * Path one of three; the other two are `VolumeIndicator` and the transport's
   * volume sheet entry. The hook reads the level rather than owning it, because
   * `usePlayerControls` is the single owner of the element and of playback state
   * — a second copy of the level here would be a second thing to drift.
   *
   * Enabled only in zones mode. On a fine pointer a horizontal drag across the
   * left third is text selection or a browser gesture, and claiming it would
   * steal an interaction that already has an owner. */
  const volumeGesture = useVolumeGesture({
    containerRef: shellRef,
    enabled: input.isTouch,
    level: controls.volume,
    muted: controls.muted,
    onVolume: controls.setVolume,
    onMuteChange: controls.setMuted,
    /* A drag is activity, so it must keep the chrome awake for as long as it
     * lasts — otherwise the volume indicator fades out under the finger that is
     * still moving, which is the one moment it needs to be readable. */
    onStart: poke,
  });

  /**
   * Play/pause drives the ELEMENT first and the machine second, and only on
   * success.
   *
   * The order is the point, and the gate on it matters more than the order. If
   * the machine moved first, or moved on `play()` merely being called, then an
   * autoplay-policy refusal would leave the button reading "Pause" over a video
   * that is still paused — the exact "looks like it works and does nothing" class
   * of bug this rewrite is about. So: call `play()`, and dispatch `RESUME` only
   * once the element confirms. A refusal leaves the machine alone and logged.
   */
  const handleTogglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      controls.play().then((started) => {
        if (started) send(E.RESUME);
      });
    } else {
      controls.pause();
      send(E.PAUSE);
    }
  }, [controls, send]);

  /* The source ladder (task.md 6.3). With no `id` there is nothing to resolve, so
   * this stays disabled and never reaches the network — which is also what keeps
   * the Phase 1 shell tests free of real resolvers.
   *
   * `resolved` is the winning source ENVELOPE, and it is what makes the Tier B
   * server indicator possible with no new data path: the source ladder already
   * decided which server won, and `resolved.source.label` is that server's
   * display name. Reading the label off the catalogue rather than echoing the
   * key is what lets the viewer recognise "Server 3" as something they picked
   * in the settings order. */
  const { url, resolved } = usePlayerSource({
    args: { type, id, season, episode, originalLanguage },
    send,
    enabled: id != null && id !== "",
  });
  const serverLabel = resolved?.source?.label || "";
  /* 3.16. Measured chapter/credits boundaries. The ONLY measured source V2 can
   * reach is the SkipDB dataset — the provider cue tags the legacy reads via its
   * custom loader are not available to V2's plain hls.js path, and are left
   * unimplemented rather than faked. See `useSkipBoundaries` for the full reason.
   * A null result simply means no marks; playback is unaffected either way. */
  const boundaries = useSkipBoundaries({ imdbId, type, season, episode });
  /* ── Subtitles (6.4's subtitle half, pulled forward so 3.18-3.23 have a real
   * node to style) ──────────────────────────────────────────────────────────
   * Fed the shell's existing `currentTime` rather than owning a second clock:
   * see the note in the hook about why a `timeupdate` subscription of its own
   * would be a fourth thing to keep in step with seeking. */
  const subtitles = usePlayerSubtitles({
    imdbId,
    title,
    currentTime: controls.currentTime,
  });

  /* 3.22. The cue has to clear the transport, and the transport's height is not a
   * constant — it changes with the tier (3.9), the layout mode (3.11) and
   * safe-area insets. Measured off the transport layer itself rather than
   * approximated with a pair of literals, which is what the legacy did and which
   * put a cue under the transport on any layout it had not been written for. */
  const [attachTransport, chromeHeight] = useChromeHeight();
  /* 3.15. The decode target for the opt-in thumbnail, or null when this source
   * cannot be previewed. Built by `previewTarget` rather than inline so the
   * master-vs-refUrl rule stays in one place — `usePlayerSource` has a copy for
   * playback and the legacy had a third at `NativePlayerView.jsx:3397`, and three
   * copies of one rule is two too many.
   *
   * Memoised because it is a new object literal otherwise, and the Scrubber's
   * preview effect depends on it: a fresh identity every shell render would
   * re-run that effect — and therefore restart the settle timer — on every
   * `timeupdate`. */
  const preview = useMemo(() => previewTarget(resolved), [resolved]);

  const handleVideoAction = useCallback(
    (action) => {
      if (!action) return;
      send(action.type, action.error);
    },
    [send],
  );

  /* The status line, fed from the machine (task.md 2.9). The mapping of state to
   * wording lives in `usePlaybackStatus` rather than here: this shell mounts at a
   * fixed entry state, so the states that actually need words (error, stalled)
   * would be untestable inline. See that hook for why the rest stay silent. */
  const status = usePlaybackStatus(state, rev, announcement);

  /* The same `selectView` the loader and the announcements already read, so the
   * transport's play button cannot claim something different from the loader
   * about the very same state. */
  const view = selectView({ state, error: null });

  return (
    <div
      ref={setShellNode}
      className="pv2-shell"
      {...playerOpenAttrs}
      /* Path one of three for touch volume (3.12). On the SHELL ROOT, not the
       * video: the video is inside the container-query box and the gesture needs
       * the full surface, and the chrome layers are children of this same root,
       * so a press that starts on a control is filtered by the hook's
       * `closest("[data-chrome-layer]")` check rather than by DOM position. */
      {...volumeGesture.handlers}
      /* 3.25. On the shell root so the sheet's `stopPropagation` can stop the
       * event before it arrives here — that is the ordering, not a check for
       * "is a panel open". */
      onKeyDown={handleShellKeyDown}
      data-reduce-motion={reduceMotion ? "true" : "false"}
      /* Build-phase marker, not playback: "1" was the shell with no element.
       * `data-state` is the machine; `data-phase` is how far the rebuild has got,
       * so it must move the moment PlayerVideo is wired in. */
      data-phase="2"
      data-state={state}
      /* Chrome visibility (task.md 3.5/3.8). The attribute carries the idle
       * timer; `:focus-within` in player.css overrides it, so keyboard always
       * wins without this component re-rendering on focus. */
      data-chrome={chromeVisible ? "visible" : "hidden"}
      /* Which settings panel is open, if any. 3.24 renders the sheet from this
       * state; stamping it now means the transport's openers are observable
       * today instead of being a `setState` with no reader. */
data-sheet={sheetPanel ?? undefined}
    >
      {showLoader ? (
        <LoadingStage
          title={title || subtitle || ""}
          backdropUrl={backdropUrl}
          posterUrl={posterUrl}
          announcement={announcement}
          state={state}
        />
      ) : null}
      {/* The element mounts ONCE the ladder produced a URL, and STAYS mounted for
        the rest of the session. Gating this on `opening` alone was a bug worth
        naming: `loadstart` advances the machine to `buffering`, so the element
        would unmount on the event it had just emitted. The video outlives the
        loader — the loader simply sits on top of it until the first frame
        (`showLoader` covers resolving/opening/buffering). Keyed on `src` so a new
        episode tears the element down instead of retargeting it. */}
      {url ? (
        <PlayerVideo
          key={url}
          src={url}
state={state}
          onAction={handleVideoAction}
          onEngine={setEngine}
          ref={attachVideo}
          autoPlay
          /* Aspect is the one preference that IS declarative (task.md 3.9): the
           * modes differ only by `object-fit` and a punch-in transform, both of
           * which are styles. Applied here rather than imperatively so React owns
           * the element's presentation and cannot desync from the preference. */
          style={prefs.aspectStyle}
        />
      ) : null}
      {/* ── Touch volume, path two of three (task.md 3.12) ─────────────────────
       * The PERSISTENT level indicator. The legacy player had only a HUD that a
       * timer cleared, so between gestures there was no on-screen evidence of
       * what the volume was — which is exactly the "undiscoverable" half of the
       * complaint. Rendered only in zones mode, and kept mounted while the finger
       * is down: a level that mounts and unmounts per drag cannot be read while
       * the finger is still moving, which is the only time it is wanted.
       *
       * `pointer-events: none` in CSS — it is a readout, and a readout that
       * swallowed the tap underneath it would break the third gesture. */}
      {input.isTouch && url ? (
        <div className="pv2-chrome" data-chrome-layer="volume">
          <VolumeIndicator
            level={controls.volume}
            muted={controls.muted}
            visible={volumeGesture.active || chromeVisible}
          />
        </div>
      ) : null}
      {/* Chrome layer (task.md 3.5). The status line is chrome like any other:
        * hiding it on the auto-hide timer is correct, and letting the timer hide
        * a keyboard user's controls is not — the `:focus-within` rule in
        * player.css is what reconciles those two, and it can only do its job if
        * the chrome is one inspectable subtree rather than a sibling of the
        * shell root. */}
      <div className="pv2-chrome" data-chrome-layer="status">
        <StatusLine
          message={status.message}
          kind={status.kind}
          live={status.live}
          onDismiss={status.dismiss}
          reduceMotion={reduceMotion}
        />
      </div>
      {/* Tier A transport (task.md 3.7). Its own layer, sibling to the status
        * chrome rather than nested inside it, because `.pv2-chrome` is `inset:
        * 0` + `pointer-events: none` — right for a floating plate, wrong for a
        * bar pinned to the bottom edge, whose own hit area is the whole row.
        * Both are children of the same shell, so the 3.5 `:focus-within` reveal
        * covers both with no extra rule. */}
      {url ? (
        <div className="pv2-chrome" data-chrome-layer="transport">
          <TransportBar
            /* On the transport itself, not on this full-bleed wrapper: see
             * `TransportBar`'s `transportRef`. Measured on the wrapper, every cue
             * would sit a whole player's height above the bottom edge. */
            transportRef={attachTransport}
            /* From the MACHINE, not from the element: one owner for playback
             * state. `selectView` is the same derivation the loader and the
             * announcements use, so the play button cannot disagree with them. */
            isPlaying={view.isPlaying}
            isPaused={view.isPaused}
            currentTime={controls.currentTime}
            duration={controls.duration}
            buffered={controls.buffered}
            muted={controls.muted}
            canFullscreen={controls.canFullscreen}
            fullscreen={controls.fullscreen}
            onTogglePlay={handleTogglePlay}
            onSeek={controls.seekTo}
            onToggleMute={controls.toggleMute}
            onToggleFullscreen={controls.toggleFullscreen}
            onOpenSheet={openSheet}
            /* 3.27. The open panel, so each opener can say whether ITS panel is the one
             * showing. Before this the row had `aria-expanded="false"` hardcoded on all
             * six openers, so a screen reader was told the Subtitles button was
             * collapsed while the Subtitles panel was on screen. */
            openPanel={sheetPanel}
            /* 3.15. Null when this source cannot be previewed, which is the signal
             * for the Scrubber to open no decoder rather than to try and fail. */
            preview={preview}
            /* 3.16. Raw measured record, or null. */
            boundaries={boundaries}
            /* ── Zones (task.md 3.11) ────────────────────────────────────── */
            /* Live input classification, not a one-time read at mount. A viewer
             * who picks up a finger part-way through a title gets the zones
             * without a reload, which is the whole reason `useInputCapability`
             * subscribes to the media queries and watches pointer events rather
             * than sampling `matchMedia` once (see task.md 3.4).
             *
             * Fine pointer gets the row; coarse gets the two thumb clusters. */
            mode={input.isTouch ? TRANSPORT_MODE.ZONES : TRANSPORT_MODE.ROW}
            /* The zones layout's volume control is the 3.12 SHEET ENTRY and shows
             * the current level; row mode keeps its mute toggle. */
            volume={controls.volume}
            /* Relative to where the media element actually is, so repeated
             * taps do not compound off a stale timeupdate. */
            onSkip={controls.skipBy}
        skipSeconds={controls.skipSeconds}
            /* `onClose` was a frozen prop with no consumer until now; the zones
             * layout is its intended user, since a fullscreen video with no
             * visible way out is a trap. */
            onClose={onClose}
            /* ── Tier B (task.md 3.9) ───────────────────────────────────── */
            tier={tier}
            /* Episode navigation is the PARENT's call — it owns season
             * boundaries — so the props are forwarded untouched and the shell
             * invents no availability of its own. */
            canGoPrev={canGoPrev}
            canGoNext={canGoNext}
            onGoPrev={onGoPrev}
            onGoNext={onGoNext}
            hasEpisodes={Array.isArray(episodes) && episodes.length > 0}
            rate={prefs.rate}
            onCycleAspect={prefs.cycleAspect}
            aspectShortName={prefs.aspectShortName}
            aspectLabel={`Aspect ratio: ${prefs.aspectName}`}
            serverLabel={serverLabel}
            /* `party.room.participants` is the count source. The watch-party
             * panel never read it (`WatchPartyPanel.jsx` shows names only), so
             * there is no existing number to reuse and the array length is the
             * honest one. Zero means no party, which is why the control's
             * accessible name changes shape rather than saying "0 watching". */
            partyCount={Array.isArray(party?.room?.participants) ? party.room.participants.length : 0}
/>
        </div>
      ) : null}

      {/* The settings sheet (task.md 3.24). Mounted AFTER the transport in JSX order
        * so it paints over it: an open sheet is a layer above the controls, and a
        * row list that renders UNDER the scrubber is unusable — the scrubber sits at
        * the bottom edge, which is exactly where a right-hand sheet's last row lands.
        * Also over the status line, which is right here: the sheet is the more
        * specific thing the viewer just asked for, and 3.25's backdrop is what will
        * eventually arbitrate between them.
        *
        * `sheetPanel` is the ONLY input. One id means one panel, so the stacked
        * overlays the legacy suffers from cannot be represented here at all. */}
      <SettingsSheet
        panelId={sheetPanel}
        onClose={closeSheet}
        panels={{
          /* R4.1. The audio model and its selector are passed as a pair because the
           * panel cannot derive either: the track list lives on the hls.js engine
           * (see `useAudioTracks`) and selecting one is a write to that same engine. */
          audio,
          selectAudio,
          subtitles,
          prefs,
          controls,
          episodes,
          currentEpisode: episode,
          onSelectEpisode,
          party,
          /* "You" in the roster. `party` is the `useWatchParty` result and carries its
           * own `identity`, but the sheet reads it as its own prop so that "who is the
           * viewer" is answered in one place: with `identity` left out, the comparison
           * in `UsersPanel` was against `undefined` and matched nobody, so the sheet
           * shipped a roster that silently never marked its own viewer. */
          identity: party?.identity ?? null,
          serverLabel,
        }}
      />

      {/* Subtitles (3.18-3.23). A sibling of the chrome layers rather than a child
       * of the transport, because `.pv2-chrome` is `pointer-events: none` and the
       * cue must clear the transport by its MEASURED height rather than be stacked
       * inside it. Rendered last so it paints above the status line; `pointer-events:
       * none` in CSS keeps it from ever swallowing a press meant for the video.
       *
       * `max()` owns the resting offset: with the chrome hidden the measurement
       * goes to ~0, and a cue pinned to the very bottom edge is unreadable on a
       * letterbox bar. */}
      {subtitles.cue ? (
        <SubtitleOverlay
          cue={subtitles.cue}
          language={subtitles.track?.language || ""}
          bottomPx={Math.max(chromeHeight, 44)}
        />
      ) : null}
    </div>
  );
});

export default PlayerShell;

/* Named so the frozen contract has a single source of truth for tests and for
   the Phase 2 ref. Kept as an object of defaults rather than a runtime
   validator: the parent is TypeScript-free JS today, and a runtime shape check
   on every mount costs more than it catches. */
export const PLAYER_PROPS = Object.freeze({
  type: "movie",
  season: 1,
  episode: 1,
  imdbId: "",
  backdropUrl: "",
  posterUrl: "",
  episodes: [],
  originalLanguage: "",
  party: null,
  reduceMotion: false,
});
