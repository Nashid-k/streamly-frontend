/* PLAYER V2 public surface.
 *
 * Phase 1 exported the shell, the loading stage, the playback state that drives
 * them, and the status line (task.md 2.8-2.9). Phase 2 adds the element that
 * actually plays (task.md 6.3): the video element, the DOM-event mapping, and the
 * source ladder. Later phases add chrome with its own phase.
 *
 * Note the `./v2/` boundary: the Phase 6 purge deletes the files one level up
 * (`player/*.jsx` + `player/index.js`) and must never touch this directory.
 */

export { default as PlayerShell, PLAYER_PROPS } from "./PlayerShell";
export { default as LoadingStage } from "./LoadingStage";
export { default as StatusLine } from "./StatusLine";
export { default as PlayerVideo } from "./PlayerVideo";
export { default as usePlaybackState } from "./hooks/usePlaybackState";
export { default as usePlaybackStatus } from "./hooks/usePlaybackStatus";
export { default as usePlayerStatus } from "./hooks/usePlayerStatus";
export { default as useInputCapability } from "./hooks/useInputCapability";
export { default as usePlayerControls } from "./hooks/usePlayerControls";
export { default as useChromeAutoHide } from "./hooks/useChromeAutoHide";
export { CHROME_IDLE_MS, canAutoHide, NEVER_HIDE_STATES } from "./chromeVisibility";
export { default as TransportBar } from "./TransportBar";
export { default as Scrubber } from "./Scrubber";
export { default as ScrubberBubble, BUBBLE_WIDTH } from "./ScrubberBubble";
export {
  hoverAnchor,
  hoverRatio,
  hoverSeconds,
  previewTarget,
  shouldShowPreview,
  THUMBNAIL_SETTLE_MS,
} from "./hoverPreview";
export { formatTimecode, progressFraction } from "./timecode";
export { boundariesAreMeasured, boundaryTicks, TICK_KIND } from "./boundaryTicks";
export { default as useSkipBoundaries } from "./hooks/useSkipBoundaries";
export { default as SubtitleOverlay } from "./SubtitleOverlay";
export { default as SettingsSheet } from "./SettingsSheet";
export { isTrapTab, nextFocusIndex, tabbables } from "./focusTrap";
export { isRadioKey, nextRadioIndex, radioTabIndex, radioTabStopIndex } from "./radioGroup";

export {
  SHEET_PANELS,
  nextPanelId,
  panelDefinition,
  panelTitle,
} from "./sheetPanels";

export {
  subtitleColor,
  subtitleFontFamily,
  subtitleLang,
  subtitleLuminance,
  subtitleScrim,
  subtitleSizeScale,
} from "./subtitleStyle";
export { default as usePlayerSubtitles } from "./hooks/usePlayerSubtitles";
export { default as useChromeHeight } from "./hooks/useChromeHeight";


export { default as VolumeIndicator } from "./VolumeIndicator";
export {
  DRAG_ARM_PX,
  GESTURE,
  GESTURE_ZONE,
  VOLUME_PATHS,
  VOLUME_TRAVEL_FRACTION,
  audibleVolume,
  classifyDrag,
  clampVolume,
  dragStartLevel,
  isHorizontalIntent,
  shouldUnmuteOnDrag,
  volumeFromDrag,
  zoneOf,
} from "./volumeGesture";
export { DEFAULT_TIER, TIER_A_CONTROLS, TIER_B_CONTROLS, TIER_B_MIN_WIDTH, SHEET_OPENERS, isSheetOpener, resolveTier, controlsForTier, TRANSPORT_MODE, TRANSPORT_SUPERSET, ALL_CONTROL_IDS, TOUCH_ZONE_LEFT, TOUCH_ZONE_RIGHT, TOUCH_ZONES, absentControls, presentControlIds, isPresentInTier, zoneOrder, zoneFor } from "./tiers";
export { formatRate, nextRate } from "./rate";
export {
  DEFAULT_ASPECT_ID,
  LEGACY_ASPECT_KEY,
  aspectNameForId,
  aspectShortNameForId,
  aspectStyleForId,
  nextAspectId,
  normalizeAspectId,
  readLegacyAspectId,
} from "./aspect";
export { default as usePlayerPrefs } from "./hooks/usePlayerPrefs";
export { default as useTier } from "./hooks/useTier";
export {
  INPUT,
  MEDIA_QUERIES,
  classifyInput,
  readMediaCapabilities,
} from "./inputCapability";
export {
  default as usePlayerSource,
  classifyResolve,
  extractPlayableUrl,
  looksRateLimited,
} from "./hooks/usePlayerSource";
export {
  default as useHlsSource,
  MODE,
  isHlsUrl,
  canPlayNativeHls,
  choosePlaybackMode,
} from "./hooks/useHlsSource";
export {
  E,
  S,
  STATES,
  initialPlayback,
  playbackReducer,
  selectView,
  canTransition,
  describeState,
} from "./playbackMachine";
export {
  STATUS_KIND,
  DEFAULT_STATUS_TTL_MS,
  INITIAL_STATUS,
  statusReducer,
  selectStatus,
  statusActions,
} from "./statusMachine";
export { MEDIA_EVENTS, mediaEventToAction } from "./mediaEvents";
export {
  OUTCOME,
  LADDER_DONE,
  LADDER_EXHAUSTED,
  LADDER_ABORTED,
  initialLadder,
  nextSource,
  advanceLadder,
  isExhausted,
  classifyOutcome,
  runLadder,
} from "./sourceLadder";
