/**
 * Streamly Components Barrel
 *
 * Categorized exports for all UI primitives, composite components,
 * modals, rails, and video player subsystems.
 */

// Core UI Primitives & Feedback
export { default as Button } from "./Button";
export { default as Chip } from "./Chip";
export { default as Loader } from "./Loader";
export { default as EmptyState } from "./EmptyState";
export { ToastProvider, useToast } from "./Toast";
export { useConfirmDialog } from "./ConfirmDialog";
export { default as Popover } from "./Popover";
export { default as SEO } from "./SEO";
export { default as ErrorBoundary } from "./ErrorBoundary";
export { default as BackToTop } from "./BackToTop";
export { default as AmbientBackground } from "./AmbientBackground";

// Headers, Skeletons & Badges
export { default as SectionHeader } from "./SectionHeader";
export { default as ContentPageHeader } from "./ContentPageHeader";
export { default as MovieDetailsSkeleton } from "./MovieDetailsSkeleton";
export { default as CountdownBadge } from "./CountdownBadge";
export { default as RatingsCluster } from "./RatingsCluster";
export { default as HeroTitleLogo } from "./HeroTitleLogo";

// Rails, Lists & Media Cards
export { default as MovieCard } from "./MovieCard";
export { default as SearchResultRow } from "./SearchResultRow";
export { default as CastRail } from "./CastRail";
export { default as DiscoveryRails } from "./DiscoveryRails";
export { default as GenreShowcase } from "./GenreShowcase";
export { default as ContinueWatchingRail } from "./ContinueWatchingRail";
export { default as LeavingSoonBanner } from "./LeavingSoonBanner";
export { default as RailArrow } from "./RailArrow";

// Modals & Overlays
export { default as TitleInfoModal } from "./TitleInfoModal";
export { default as DownloadModal } from "./DownloadModal";
export { default as GlobalShortcuts } from "./GlobalShortcuts";

// Video Player & Studio
export { default as CustomVideoPlayer } from "./CustomVideoPlayer";
export { default as PlayerPreview } from "./PlayerPreview";
export { default as YoutubeRawTrailer } from "./YoutubeRawTrailer";
export * from "./playerUIDef";
