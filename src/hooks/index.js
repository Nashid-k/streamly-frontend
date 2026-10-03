/**
 * Streamly Hooks Barrel
 *
 * Consolidated entry point for all custom React hooks.
 */

export { useDebounce } from "./useDebounce";
export { default as useDetailView } from "./useDetailView";
export { useMediaQuery } from "./useMediaQuery";
export { default as useRailArrows } from "./useRailArrows";
export { useScrollRestoration } from "./useScrollRestoration";
export {
  useMyList,
  useMyList as useWatchlist,
  useContinueWatching,
  useSearchHistory,
} from "./useUserData";
export { useVirtualRenderAdapter } from "./useVirtualRenderAdapter";
export { default as useIsTouch } from "./useIsTouch";
export { default as useContainerSize } from "./useContainerSize";
