import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary";
import Loader from "../components/Loader";

const HomePage = lazy(() => import("../pages/HomePage"));
const DiscoveryPage = lazy(() => import("../pages/DiscoveryPage"));
const TitleDetails = lazy(() => import("../pages/TitleDetailsPage"));
const PersonDetails = lazy(() => import("../pages/PersonDetailsPage"));
const SearchPage = lazy(() => import("../pages/SearchPage"));
const CategoryPage = lazy(() => import("../pages/CategoryPage"));
const GenrePage = lazy(() => import("../pages/GenrePage"));
const WatchlistPage = lazy(() => import("../pages/WatchlistPage"));
const ExploreCollectionsPage = lazy(() => import("../pages/ExploreCollectionsPage"));
const PublicCollectionPage = lazy(() => import("../pages/PublicCollectionPage"));
const HistoryPage = lazy(() => import("../pages/HistoryPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const DownloadsPage = lazy(() => import("../pages/DownloadsPage"));
// Temporary native-playback prototype (hls.js) — remove before productizing.
const NativeProtoPage = lazy(() => import("../pages/NativeProtoPage"));

/* Routes wrapped in a route-keyed ErrorBoundary + Suspense so a page that
   crashes shows the fallback once but recovers automatically the moment the
   user navigates (without requiring a hard reload). */
function AppRoutes() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Suspense fallback={<Loader />}>
        <Routes>
              <Route
                path="/"
                element={
                  <HomePage filter="all" />
                }
              />
              <Route
                path="/series"
                element={<DiscoveryPage mode="series" />}
              />
              <Route
                path="/movies"
                element={<DiscoveryPage mode="movies" />}
              />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/category/:name" element={<CategoryPage />} />
              <Route path="/genre/:genre" element={<GenrePage />} />
              <Route path="/watch/:id/:slug?" element={<TitleDetails />} />
              <Route path="/person/:id/:slug?" element={<PersonDetails />} />
              {/* Legacy redirects */}
              <Route path="/watchlist" element={<WatchlistPage />} />
              <Route
                path="/explore/collections"
                element={<ExploreCollectionsPage />}
              />
              <Route
                path="/collections/:publicId"
                element={<PublicCollectionPage />}
              />
              <Route path="/mylist" element={<Navigate to="/watchlist" replace />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route path="/proto-native" element={<NativeProtoPage />} />
              <Route path="/continue-watching" element={<Navigate to="/history" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default AppRoutes;