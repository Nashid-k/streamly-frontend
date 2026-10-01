import {
  Captions,
  Fullscreen,
  Gauge,
  ListVideo,
  Minimize,
  Pause,
  Play,
  Ratio,
  RotateCcw,
  RotateCw,
  Server,
  Settings,
  SkipBack,
  SkipForward,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Scrubber from "./Scrubber";
import { panelDomId } from "./sheetPanels";
import { formatTimecode } from "./timecode";
import {
  ALL_CONTROL_IDS,
  DEFAULT_TIER,
  TRANSPORT_MODE,
  isPresentInTier,
  isSheetOpener,
  zoneFor,
  zoneOrder,
  zonePushesToEnd,
} from "./tiers";
import { SKIP_SECONDS } from "../../../constants/playerUi";
import { formatRate } from "./rate";

/**
 * Tier A â€” the compact transport (task.md 3.7), Tier B â€” the full transport
 * (task.md 3.9).
 *
 * Tier A is `play - timecode - scrubber - volume - captions - settings -
 * fullscreen`; Tier B is that spine with six more controls slotted around it.
 * Both orders are asserted against `tiers.js` in the test suite, because a
 * reorder is invisible in review and expensive for every viewer who has to
 * relearn where the scrubber lives.
 *
 * ONE element renders every layout (task.md 3.10, extended by 3.11). Tier A is a
 * strict SUBSET of Tier B, so the transport maps over `ALL_CONTROL_IDS` and
 * expresses the layout as PRESENCE: every control is always in the DOM and the
 * ones belonging to another layout are marked `data-presence="absent"`. The
 * zones layout (3.11) adds three controls that exist in neither tier spine, so
 * the rendered total is seventeen — fourteen from the tiers, plus skip-back,
 * skip-forward and close. Nothing is
 * mounted or unmounted as the tier changes, so the row grows and shrinks in
 * place and tab order is continuous by construction.
 *
 * An absent control is `inert` + `aria-hidden` on the SAME paint it goes absent,
 * not after its fade finishes. Otherwise there is a stretch of the animation
 * where a keyboard user can tab into something they cannot see.
 *
 * â”€â”€ Icons come from lucide-react â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Already a dependency (`package.json`), already used by the app's own chrome
 * (`app/Header.jsx`, `app/MobileBottomNav.jsx`, `constants/navigation.js`), so the
 * player matches the rest of the app instead of carrying a second icon set.
 * `aria-hidden` on every one of them, always: the accessible name comes from the
 * `aria-label`, and a screen reader that reads both says "Play, Play".
 *
 * â”€â”€ Disabled controls are explained, not just greyed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * `fullscreen` is capability-checked rather than hidden. A control that vanishes
 * is undiscoverable and shifts the row; a control that is visibly unavailable
 * with a reason in its `title` teaches the viewer why the button is there. 3.31
 * applies the same rule to the quality rungs.
 */
function IconButton({
  label,
  title,
  disabled,
  onClick,
  haspopup,
  expanded,
  controls,
  present = true,
  order,
  zone,
  pushes,
  children,
}) {
  return (
    <button
      type="button"
      className="pv2-icon-btn"
      style={order == null ? undefined : { "--pv2-order": order }}
      aria-label={label}
      title={title ?? label}
      disabled={disabled || !present}
      /* Not focusable and not exposed while the control belongs to the other
       * tier (task.md 3.10). This is the tab-order half of "cross-fade in place":
       * an absent control stays in the DOM so the row can grow smoothly, and
       * `inert` is what stops a keyboard user tabbing into something they cannot
       * see. It must be applied on the SAME paint the control goes absent â€”
       * deferring it until the fade finished would make a focusable ghost for
       * the length of the animation.
       *
       * `aria-hidden` is the belt to `inert`'s braces: it keeps the control out
       * of the accessibility tree even where `inert` is unsupported. */
      inert={present ? undefined : true}
      aria-hidden={present ? undefined : "true"}
      tabIndex={present ? undefined : -1}
      data-presence={present ? "present" : "absent"}
      /* Which bottom corner this control belongs to in zones mode, or absent in
       * row mode. `order` positions it; this says WHY, and gives 6.8's browser
       * checklist something concrete to count ("four left, four right"). */
      data-zone={zone ?? undefined}
      /* On the right cluster's first control only — see `zonePushesToEnd`. This
       * single auto margin is what splits the row into two corners. */
      data-zone-push={pushes ? "true" : undefined}
      onClick={onClick}
      /* Only present on sheet openers. `aria-haspopup` on a button that opens
       * nothing would be a false promise — which is exactly why it is derived
       * from SHEET_OPENERS rather than sprinkled on call sites. */
      aria-haspopup={haspopup ? "dialog" : undefined}
      aria-expanded={haspopup ? String(expanded === true) : undefined}
      /* 3.27. `controls` is null for anything that is not an opener, and null must
       * arrive here as `undefined`: React renders `aria-controls="null"` for a null
       * value, and an id that resolves to nothing is a worse reference than none. */
      aria-controls={haspopup ? (controls ?? undefined) : undefined}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

/** A control whose CURRENT VALUE is the point â€” the speed, the server. The value
 *  is the visible text, so the row answers "how fast / which server" without the
 *  viewer opening anything, and the accessible name still describes the control
 *  rather than reading a bare number. */
function ValueButton({
  label,
  value,
  title,
  haspopup,
  expanded,
  controls,
  onClick,
  present = true,
  order,
  zone,
  pushes,
  titleAsValue = false,
  children,
}) {
  return (
    <button
      type="button"
      className="pv2-value-btn"
      style={order == null ? undefined : { "--pv2-order": order }}
      /* `titleAsValue` exists for `volume`, whose value is a live number that
       * changes on every pointermove. Putting that in the accessible NAME would
       * make the control re-announce itself on every move of a drag, so on volume
       * the visible value is the accessible name and the static description goes
       * to `title`. Every other control keeps name=description, value=text. */
      aria-label={titleAsValue ? `${label}: ${value}` : label}
      title={titleAsValue ? label : (title ?? label)}
      disabled={!present}
      /* Same tier-presence treatment as `IconButton` â€” see the note there for
       * why `inert` and `aria-hidden` must land on the same paint. */
      inert={present ? undefined : true}
      aria-hidden={present ? undefined : "true"}
      tabIndex={present ? undefined : -1}
      data-presence={present ? "present" : "absent"}
      /* Which bottom corner this control belongs to in zones mode, or absent in
       * row mode. `order` positions it; this says WHY, and gives 6.8's browser
       * checklist something concrete to count ("four left, four right"). */
      data-zone={zone ?? undefined}
      /* On the right cluster's first control only — see `zonePushesToEnd`. This
       * single auto margin is what splits the row into two corners. */
      data-zone-push={pushes ? "true" : undefined}
      onClick={onClick}
      aria-haspopup={haspopup ? "dialog" : undefined}
      aria-expanded={haspopup ? String(expanded === true) : undefined}
      aria-controls={haspopup ? (controls ?? undefined) : undefined}
    >
      <span className="pv2-value-btn__icon" aria-hidden="true">
        {children}
      </span>
      <span className="pv2-value-btn__value">{value}</span>
    </button>
  );
}

export default function TransportBar({
  isPlaying = false,
  isPaused = false,
  currentTime = 0,
  duration = 0,
  /** Seconds of video buffered past the playhead (3.14). Read only by the
   *  scrubber; every other control here is about intent, not state. */
  buffered = 0,
  /** 3.15. The opt-in thumbnail's decode target, or null when this source cannot
   *  be previewed. Forwarded untouched — the transport is the only place the
   *  shell and the scrubber meet, so it passes source facts through rather than
   *  deciding anything about them. */
  preview = null,
  /** 3.16. Measured boundary record or null — forwarded to the scrubber raw. */
  boundaries = null,
  muted = false,
  /** Current level 0-1. Only read in zones mode, where the volume control shows
   *  it; row mode's mute toggle has no level to display. */
  volume = 0,
  canFullscreen = false,
  fullscreen = false,
  onTogglePlay,
  onSeek,
  onToggleMute,
  onToggleFullscreen,
  /** Panel id for a sheet opener, e.g. "captions". 3.24 renders the sheet and
   *  3.27 attaches `aria-controls`; until then the button is honest about being
   *  an opener via `aria-haspopup` rather than silently inert. */
  onOpenSheet,
  /** 3.27. The panel id currently open in the sheet, or null.
   *
   *  Before this, `aria-expanded` was hardcoded `false` on every opener — so a
   *  screen-reader user was told the Subtitles button was collapsed while the
   *  Subtitles panel was on screen in front of them. `aria-expanded` is a CLAIM about
   *  state, and a claim that is always "no" is worse than no claim: it is
   *  indistinguishable from a control that is broken, and it makes
   *  `aria-controls` incoherent, because the opener would name a panel it insists is
   *  not there.
   *
   *  Null means "nothing open", which is the shell's `sheetPanel` when it is closed —
   *  the same state, so the two cannot disagree. */
  openPanel = null,
  /** Which control set to render (task.md 3.9). Defaults to Tier A so a caller
   *  that forgets it gets the compact set, not an empty row. */
  tier = DEFAULT_TIER,
  /**
   * Row or thumb zones (task.md 3.11).
   *
   * A second axis from `tier`, because a tier answers "how much room is there"
   * and this answers "what is the viewer holding". In `ZONES` the controls are
   * laid out as two corner clusters at thumb-sized hit targets and the tier is
   * ignored entirely â€” a tablet held in two hands has plenty of width and no use
   * for a 14-control rail.
   */
  mode = TRANSPORT_MODE.ROW,
  onSkip,
  /** Closes the player. The zones layout's only way out; when the parent passes
   *  nothing the button is disabled and says why rather than disappearing. */
  onClose,
  /* â”€â”€ Tier B only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  /** Episode navigation. `undefined` means "no parent opinion", in which case
   *  the button is DISABLED rather than assumed available â€” see the note on the
   *  case below. */
  canGoPrev,
  canGoNext,
  onGoPrev,
  onGoNext,
  hasEpisodes = false,
  rate = 1,
  /** Cycles to the next ratio. An IMMEDIATE action, not a sheet opener: the
   *  legacy player cycled from the rail too (`Ratio` button, and the `A` key),
   *  and a cycling control has no dead state to guard against. */
  onCycleAspect,
  aspectShortName = "",
  aspectLabel = "",
  serverLabel = "",
  partyCount = 0,
  className = "",
  /* 3.18's subtitle clearance needs the transport's own height, and the transport is
   * a child of the full-bleed `.pv2-chrome` layer — so this ref is attached HERE, to
   * `.pv2-transport`, rather than to the wrapper.
   *
   * Measuring the wrapper returns the height of the whole player, which would place
   * every cue a full player's height above the bottom edge: off-screen, for every
   * title, with no test failure to explain why. `getBoundingClientRect().height` is
   * honest about whichever node it is handed, so the only thing that matters is being
   * handed the right one. */
  transportRef = null,
}) {
  const isSeriesNavEnabled = canGoPrev === true || canGoNext === true;
  const partyActive = partyCount > 0;
  /* Read once per render rather than per control: the volume case needs to know
   * whether it is the corner control or the row's mute toggle, and that is a
   * property of the whole layout. */
  const zones = mode === TRANSPORT_MODE.ZONES;

  /* 3.27. Whether THIS opener's panel is the open one.
   *
   * Derived from `openPanel` rather than threaded down from the shell as a per-button
   * boolean, because there are six openers and each one had `expanded={false}`
   * written into it: a per-button boolean is six chances to hardcode the same wrong
   * answer, and hardcoded is exactly what happened. One comparison against one state
   * cannot be stale in that way.
   *
   * `=== controlId` rather than a truthiness test: `openPanel` is a string or null,
   * and a panel that is open is open for exactly ONE opener — 3.24's invariant is
   * that there is never a moment with two panels, so an opener that merely *could*
   * have a panel is not expanded. */
  const isPanelOpen = (id) => openPanel != null && openPanel === id;

  return (
    <div
      ref={transportRef}
      className={`pv2-transport pv2-transport--tier-${tier.toLowerCase()} ${className}`.trim()}
      /* Stamped as data, not just as a class, so a test (and 6.8's browser
       * checklist) can read the tier off the DOM instead of inferring it from
       * which buttons happen to be present. */
      data-tier={tier}
      /* The second axis, on the DOM for the same reason. `data-mode` is also what
       * the CSS keys the zones layout off â€” no @media, per 3.6. */
      data-mode={mode}
    >
      {ALL_CONTROL_IDS.map((controlId) => {
        /* Presence, not membership (task.md 3.10). Every control is rendered
         * unconditionally and the layout is expressed by this flag, so crossing
         * between tiers â€” or between row and zones â€” never mounts or unmounts a
         * node. The row grows and shrinks in place instead of being replaced.
         *
         * `present` is about which LAYOUT the control belongs to. It is
         * deliberately not "is this control usable": a disabled prev/next on the
         * first episode is present and still occupies its place in the row. */
        const present = isPresentInTier(controlId, tier, mode);
        /* Visual order for the zones layout, as a CSS custom property so the
         * `order` stays in the stylesheet and the DOM order never changes. `0`
         * for row-only controls is inert â€” CSS only reads it in zones mode. */
        const order = zoneOrder(controlId);
        /* Which corner this control belongs to in zones mode. `null` for row-only
         * controls, which then carry no `data-zone` at all. */
        const zone = zoneFor(controlId);
        /* See `zonePushesToEnd` — exactly one control carries the gap. */
        const pushes = zonePushesToEnd(controlId);
        switch (controlId) {
          case "play":
            return (
              <IconButton
                key={controlId}
                present={present}
                /* The label follows the ACTION, so it always names what the
                 * press will do. A button that says "Play" while paused is the
                 * single most common transport a11y bug. */
                label={isPlaying && !isPaused ? "Pause" : "Play"}
                onClick={onTogglePlay}
                order={order}
                zone={zone}
                pushes={pushes}
              >
                {isPlaying && !isPaused ? <Pause /> : <Play />}
              </IconButton>
            );

          case "timecode":
            /* `pv2-timecode` is mono + tabular (3.1): a proportional clock
             * changes width on every tick and the row visibly jitters.
             *
             * No `aria-hidden`/`inert` here, and there must not be one. The clock
             * is TEXT, not a control: it carries no focus, no name and no
             * action, so there is nothing for a keyboard user to reach and nothing
             * a screen reader needs to be shielded from — `aria-hidden="true"` on
             * live position text would hide the fact that playback is advancing.
             * `data-presence` still drives the collapse; only the a11y flags that
             * apply to interactive controls are deliberately absent. */
            return (
              <span
                key={controlId}
                className="pv2-timecode pv2-transport__time"
                data-presence={present ? "present" : "absent"}
              >
                {formatTimecode(currentTime)}
                <span className="pv2-transport__time-sep" aria-hidden="true">
                  {" / "}
                </span>
                {formatTimecode(duration)}
              </span>
            );

          case "scrubber":
            return (
              <Scrubber
                key={controlId}
                className="pv2-transport__scrubber"
                currentTime={currentTime}
                duration={duration}
                /* 3.14. The buffered band is a property of the element, not of the
                 * control set, so it is passed rather than derived here. */
                buffered={buffered}
/* 3.15's opt-in lives in the Scrubber, which owns the pointer. */
                preview={preview}
                /* 3.16. Measured boundaries, passed raw so the estimated-vs-measured
                 * decision stays in `boundaryTicks.js` where the rule lives. */
                boundaries={boundaries}
                onSeek={onSeek}
                present={present}
              />
            );

          case "volume":
            /* TWO controls in one case, because 3.12 turned a single mute toggle
             * into the SHEET ENTRY — and a sheet opener must be a different
             * element from a mute toggle, or "open the volume panel" and "silence
             * the video" would occupy one button and fight.
             *
             * Zones mode gets the ValueButton: it opens the sheet AND shows the
             * current level as its visible text, which is what makes volume
             * discoverable on touch at all. Row mode keeps the mute toggle exactly
             * as 3.7 built it, so the desktop transport is unchanged.
             *
             * Mute stays reachable in zones mode through the sheet's own control
             * (3.24) and through the drag, which unmutes on the way up. It is not
             * on the corner cluster, and that is the trade: eight corner slots is
             * already the most a thumb can hold. */
            if (zones) {
              return (
                <ValueButton
                  key={controlId}
                  present={present}
                  label="Volume"
                  value={`${Math.round(volume * 100)}%`}
                  titleAsValue
                  haspopup={isSheetOpener(controlId)}
                  expanded={isPanelOpen(controlId)}
                  controls={panelDomId(controlId)}
                  onClick={onOpenSheet ? () => onOpenSheet(controlId) : undefined}
                  order={order}
                  zone={zone}
                  pushes={pushes}
                >
                  {muted ? <VolumeX /> : <Volume2 />}
                </ValueButton>
              );
            }
            return (
              <IconButton
                key={controlId}
                present={present}
                /* Mute is named by RESULT, not by the current icon: after
                 * muting, the button's job is "Unmute". */
                label={muted ? "Unmute" : "Mute"}
                onClick={onToggleMute}
              >
                {muted ? <VolumeX /> : <Volume2 />}
              </IconButton>
            );

          case "captions":
          case "settings":
            return (
              <IconButton
                key={controlId}
                present={present}
                label={controlId === "captions" ? "Subtitles" : "Settings"}
                haspopup={isSheetOpener(controlId)}
                expanded={isPanelOpen(controlId)}
                controls={panelDomId(controlId)}
                onClick={onOpenSheet ? () => onOpenSheet(controlId) : undefined}
                order={order}
                zone={zone}
                pushes={pushes}
              >
                {controlId === "captions" ? <Captions /> : <Settings />}
              </IconButton>
            );

          case "fullscreen":
            return (
              <IconButton
                key={controlId}
                present={present}
                label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                disabled={!canFullscreen}
                title={
                  canFullscreen
                    ? undefined
                    : "Fullscreen is not available in this browser or embedded view"
                }
                onClick={onToggleFullscreen}
                order={order}
                zone={zone}
                pushes={pushes}
              >
                {fullscreen ? <Minimize /> : <Fullscreen />}
              </IconButton>
            );

          /* â”€â”€ Zones only (task.md 3.11) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

          case "skipBack":
          case "skipForward":
            /* Deliberately NOT `SkipBack`/`SkipForward` glyphs: those two are
             * already in this row as the episode stepper directly above, and
             * identical icons meaning "previous episode" and "10 seconds back"
             * is worse than no icons at all. A circular arrow reads as a rewind
             * without borrowing the neighbour's meaning.
             *
             * Disabled at the ends of the media rather than clamped silently: a
             * skip at 0:00 that visibly does nothing is a dead control, and 3.7
             * rules those out. */
            return (() => {
              const isBack = controlId === "skipBack";
              /* "At the end" is only meaningful when the duration is KNOWN. A
               * live stream or a source whose metadata has not landed reports
               * `NaN`/`Infinity`, and treating that as "already at the end" would
               * disable forward-skip until metadata arrives — stranding the
               * viewer on a bar that recovers a second later. */
              const atStart = currentTime <= 0;
              const atEnd = Number.isFinite(duration) && duration > 0 && currentTime >= duration;
              const reached = isBack ? atStart : atEnd;
              const label = `${isBack ? "Back" : "Forward"} ${SKIP_SECONDS} seconds`;
              return (
                <IconButton
                  key={controlId}
                  present={present}
                  label={label}
                  disabled={reached}
                  title={reached ? undefined : label}
                  onClick={onSkip ? () => onSkip(isBack ? -SKIP_SECONDS : SKIP_SECONDS) : undefined}
                  order={order}
                  zone={zone}
                  pushes={pushes}
                >
                  {isBack ? <RotateCcw /> : <RotateCw />}
                </IconButton>
              );
            })();

          case "close":
            /* Present-and-disabled when the parent passes no `onClose`, for the
             * same reason as Episodes on a movie: a missing way out of a
             * fullscreen video is a trap, and a control that vanishes when a prop
             * is forgotten hides the bug instead of surfacing it. */
            return (
              <IconButton
                key={controlId}
                present={present}
                label="Close player"
                disabled={!onClose}
                title={onClose ? undefined : "Closing the player is not available here"}
                onClick={onClose}
                order={order}
                zone={zone}
                pushes={pushes}
              >
                <X />
              </IconButton>
            );

          /* â”€â”€ Tier B (task.md 3.9) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

          case "episodes":
            return (
              <IconButton
                key={controlId}
                present={present}
                label="Episodes"
                haspopup={isSheetOpener(controlId)}
                expanded={isPanelOpen(controlId)}
                controls={panelDomId(controlId)}
                /* A movie has no episode list, so the control is present and
                 * explained rather than absent: 3.5 keeps hidden controls in the
                 * tab order, and a gap in the row where "Episodes" should be
                 * looks like a rendering fault rather than a deliberate choice. */
                disabled={!hasEpisodes}
                title={hasEpisodes ? undefined : "This title has no episode list"}
                onClick={onOpenSheet ? () => onOpenSheet(controlId) : undefined}
              >
                <ListVideo />
              </IconButton>
            );

          case "prevEpisode":
          case "nextEpisode":
            /* One case for both, because they differ only in direction and
             * duplicating them would be how the two labels drift apart.
             *
             * `canGoPrev`/`canGoNext` are OPTIONAL props (the parent may not pass
             * them for a movie). An undefined is therefore treated as "no" â€” NOT
             * as "allowed". Guessing "allowed" would hand a viewer a working-
             * looking button that does nothing, which is the exact dead-control
             * failure 3.7's ordering test exists to prevent. */
            return (() => {
              const isPrev = controlId === "prevEpisode";
              const allowed = (isPrev ? canGoPrev : canGoNext) === true;
              const label = isPrev ? "Previous episode" : "Next episode";
              return (
                <IconButton
                  key={controlId}
                  present={present}
                  label={label}
                  disabled={!allowed}
                  title={allowed ? undefined : isSeriesNavEnabled ? label : "Not available for this title"}
                  onClick={
                    allowed ? (isPrev ? onGoPrev : onGoNext) : undefined
                  }
                >
                  {isPrev ? <SkipBack /> : <SkipForward />}
                </IconButton>
              );
            })();

          case "speed":
            return (
              <ValueButton
                key={controlId}
                present={present}
                label="Playback speed"
                value={formatRate(rate)}
                title="Playback speed"
                haspopup={isSheetOpener(controlId)}
                expanded={isPanelOpen(controlId)}
                controls={panelDomId(controlId)}
                onClick={onOpenSheet ? () => onOpenSheet(controlId) : undefined}
                order={order}
                zone={zone}
                pushes={pushes}
              >
                <Gauge />
              </ValueButton>
            );

          case "aspect":
            /* The full aspect name is "Fit (Original 16:9)" â€” far too long for
             * the row â€” so the accessible name carries it while the visible text
             * stays short. A viewer using a screen reader gets the precise
             * value; a sighted one gets the short one and the same `title` on
             * hover. */
            return (
              <ValueButton
                key={controlId}
                present={present}
                /* Falls back to the SHORT name, not to a bare "Aspect ratio". An
                 * accessible name that omits the current value is strictly worse
                 * than the visible text a sighted viewer reads, and the fallback
                 * fires exactly when a caller forgets this prop. */
                label={aspectLabel || `Aspect ratio: ${aspectShortName}`}
                value={aspectShortName}
                title={aspectLabel || aspectShortName}
                haspopup={false}
                onClick={onCycleAspect}
              >
                <Ratio />
              </ValueButton>
            );

          case "server":
            /* Not a chip: a button, because it is also the way IN to switching
             * servers (3.24's panel). Its label is the active server, so the row
             * tells the viewer which stream they are actually watching â€” which is
             * genuinely useful when quality differs between servers. */
            return (
              <ValueButton
                key={controlId}
                present={present}
                label="Servers"
                value={serverLabel}
                title={serverLabel ? `Servers â€” ${serverLabel}` : "Servers"}
                haspopup={isSheetOpener(controlId)}
                expanded={isPanelOpen(controlId)}
                controls={panelDomId(controlId)}
                onClick={onOpenSheet ? () => onOpenSheet(controlId) : undefined}
              >
                <Server />
              </ValueButton>
            );

          case "users":
            return (
              <IconButton
                key={controlId}
                present={present}
                /* The COUNT is the state here, so it belongs in the accessible
                 * name â€” "Watch Party" alone tells a screen-reader user nothing
                 * about whether anyone else is actually watching. */
                label={partyActive ? `Watch Party, ${partyCount} watching` : "Watch Party"}
                haspopup={isSheetOpener(controlId)}
                expanded={isPanelOpen(controlId)}
                controls={panelDomId(controlId)}
                onClick={onOpenSheet ? () => onOpenSheet(controlId) : undefined}
              >
                <Users />
              </IconButton>
            );

          default:
            /* An id in a tier list with no case here means the spine and the
             * renderer disagree. Returning nothing would silently shorten the
             * row, which is the failure mode this file exists to prevent. */
            return null;
        }
      })}
    </div>
  );
}

