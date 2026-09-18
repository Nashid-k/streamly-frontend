import { describe, it, expect } from "vitest";

// Verify @/ path alias and barrel exports
import * as Components from "@/components";
import * as Hooks from "@/hooks";
import * as Context from "@/context";
import * as Utils from "@/utils";
import * as Api from "@/api";

describe("Architecture & Folder Structure Barrels", () => {
  it("exports core components from @/components barrel", () => {
    expect(Components.Button).toBeDefined();
    expect(Components.Chip).toBeDefined();
    expect(Components.MovieCard).toBeDefined();
    expect(Components.TitleInfoModal).toBeDefined();
    expect(Components.CustomVideoPlayer).toBeDefined();
    expect(Components.PlayerPreview).toBeDefined();
    expect(Components.ToastProvider).toBeDefined();
    expect(Components.useToast).toBeDefined();
    expect(Components.useConfirmDialog).toBeDefined();
    expect(Components.ErrorBoundary).toBeDefined();
    expect(Components.SEO).toBeDefined();
    expect(Components.DiscoveryRails).toBeDefined();
    expect(Components.ContinueWatchingRail).toBeDefined();
    expect(Components.PLAYER_SPEEDS).toBeDefined();
  });

  it("exports hooks from @/hooks barrel", () => {
    expect(Hooks.useDebounce).toBeDefined();
    expect(Hooks.useDetailView).toBeDefined();
    expect(Hooks.useMediaQuery).toBeDefined();
    expect(Hooks.useRailArrows).toBeDefined();
    expect(Hooks.useScrollRestoration).toBeDefined();
    expect(Hooks.useMyList).toBeDefined();
    expect(Hooks.useWatchlist).toBeDefined();
    expect(Hooks.useContinueWatching).toBeDefined();
    expect(Hooks.useSearchHistory).toBeDefined();
    expect(Hooks.useVirtualRenderAdapter).toBeDefined();
  });

  it("exports contexts from @/context barrel", () => {
    expect(Context.AuthProvider).toBeDefined();
    expect(Context.useAppAuth).toBeDefined();
    expect(Context.PreferencesProvider).toBeDefined();
    expect(Context.usePreferences).toBeDefined();
    expect(Context.DEFAULT_PREFERENCES).toBeDefined();
    expect(Context.LEGACY_SERVER_NAME_MAP).toBeDefined();
  });

  it("exports utilities from @/utils barrel", () => {
    expect(Utils.asArray).toBeDefined();
    expect(Utils.EMPTY_ARRAY).toBeDefined();
    expect(Utils.logError).toBeDefined();
    expect(Utils.logInfo).toBeDefined();
    expect(Utils.getPlatformName).toBeDefined();
    expect(Utils.getRatingColor).toBeDefined();
    expect(Utils.buildMetaFacts).toBeDefined();
    expect(Utils.isChunkLoadError).toBeDefined();
  });

  it("exports api services and adapters from @/api barrel", () => {
    expect(Api.tmdb).toBeDefined();
    expect(Api.movieService).toBeDefined();
    expect(Api.fetchOmdbByImdbId).toBeDefined();
    expect(Api.ratingService).toBeDefined();
    expect(Api.VideoSourceAdapter).toBeDefined();
    expect(Api.SubtitleFetcher).toBeDefined();
    expect(Api.PrefetchAdapter).toBeDefined();
    expect(Api.CdnImageAdapter).toBeDefined();
    expect(Api.useVirtualRenderAdapter).toBeDefined();
  });
});
