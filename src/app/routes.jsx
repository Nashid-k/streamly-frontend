import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
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
// Not lazy, unlike its neighbours: this page is the first paint after clicking a
// link in an email, and a second Suspense flash before "Confirm my email" is
// pure latency on the one screen that has to land.
import VerifyEmailPage from "../pages/VerifyEmailPage";

/* Routes wrapped in a route-keyed ErrorBoundary + Suspense so a page that
   crashes shows the fallback once but recovers automatically the moment the
   user navigates (without requiring a hard reload). */
function NoMatch() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-bold tracking-tight">404</p>
      <p className="text-sm text-muted-foreground">
        This page does not exist.
      </p>
      <Link className="text-sm font-medium underline underline-offset-4" to="/">
        Back to Home
      </Link>
    </div>
  );
}

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
              <Route path="/continue-watching" element={<Navigate to="/history" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Lands from the emailed link, usually in a cold tab. Deliberately
              NOT lazy: it is a bare confirm button with no page data behind it,
              and a second Suspense flash before the user can click "Verify" is
              pure latency. */}
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          {/* Unknown path: an unmatched <Routes> renders NOTHING, so a stale
              bookmarked link lands on a blank screen. Surface it honestly
              instead of pretending every route exists. */}
          <Route path="*" element={<NoMatch />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default AppRoutes;