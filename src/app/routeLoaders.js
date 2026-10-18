/* The one place a page chunk gets imported. routes.jsx feeds each entry to
   React.lazy, and routeWarmup.js replays the same functions during idle time
   and on link hover/focus, so the loader FUNCTION is shared but the promise
   cache is the ESM module registry itself — React.lazy's first render, an
   idle warm pass and a hover prefetch can never duplicate a download. Keys are
   logical page names; mapping a URL to a loader lives in routeWarmup.js. */
export const pageLoaders = {
  home: () => import("../pages/HomePage"),
  discovery: () => import("../pages/DiscoveryPage"),
  titleDetails: () => import("../pages/TitleDetailsPage"),
  personDetails: () => import("../pages/PersonDetailsPage"),
  search: () => import("../pages/SearchPage"),
  category: () => import("../pages/CategoryPage"),
  genre: () => import("../pages/GenrePage"),
  watchlist: () => import("../pages/WatchlistPage"),
  exploreCollections: () => import("../pages/ExploreCollectionsPage"),
  publicCollection: () => import("../pages/PublicCollectionPage"),
  history: () => import("../pages/HistoryPage"),
  settings: () => import("../pages/SettingsPage"),
  notFound: () => import("../pages/NotFoundPage"),
};
