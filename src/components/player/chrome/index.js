// Player chrome components.
//
// Phase 0 of the player redesign: the chrome is being lifted out of
// NativePlayerView.jsx one region at a time, with the playback engine left
// untouched. Each component owns its markup and takes explicit props/callbacks,
// so the Apple TV+ re-layout can restyle a region without going near the engine.
export { default as IconBtn } from "./IconBtn";
export { default as SkipPill } from "./SkipPill";
export { default as SubtitleOverlay } from "./SubtitleOverlay";
export { default as ChromeTopBar } from "./ChromeTopBar";
export { default as CenterStack } from "./CenterStack";
export { default as TapToUnmutePill } from "./TapToUnmutePill";
export { default as BottomChrome } from "./BottomChrome";
export { default as ResumeCard } from "./ResumeCard";
export { default as UpNextCard } from "./UpNextCard";
export { default as PlayerPanel } from "./PlayerPanel";
export { default as FatalBanner } from "./FatalBanner";
export { default as DialogRow } from "./DialogRow";
export { default as EpisodesRail } from "./EpisodesRail";
export * from "./primitives";
export * from "./icons";
export * from "./constants";