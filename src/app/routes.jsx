import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary";
import Loader from "../components/Loader";
import { pageLoaders } from "./routeLoaders";

// Every lazy route pulls its chunk through routeLoaders.js, so the idle/link
// warm-up in routeWarmup.js can import the SAME module ahead of the click —
// the Suspense fallback then never appears for a warmed route.
const HomePage = lazy(pageLoaders.home);
const DiscoveryPage = lazy(pageLoaders.discovery);
const TitleDetails = lazy(pageLoaders.titleDetails);
const PersonDetails = lazy(pageLoaders.personDetails);
const SearchPage = lazy(pageLoaders.search);
const CategoryPage = lazy(pageLoaders.category);
const GenrePage = lazy(pageLoaders.genre);
const WatchlistPage = lazy(pageLoaders.watchlist);
const ExploreCollectionsPage = lazy(pageLoaders.exploreCollections);
const PublicCollectionPage = lazy(pageLoaders.publicCollection);
const HistoryPage = lazy(pageLoaders.history);
const SettingsPage = lazy(pageLoaders.settings);
const NotFoundPage = lazy(pageLoaders.notFound);
// Not lazy, unlike its neighbours: this page is the first paint after clicking a
// link in an email, and a second Suspense flash before "Confirm my email" is
// pure latency on the one screen that has to land.
import VerifyEmailPage from "../pages/VerifyEmailPage";

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
              <Route path="/continue-watching" element={<Navigate to="/history" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Lands from the emailed link, usually in a cold tab. Deliberately
              NOT lazy: it is a bare confirm button with no page data behind it,
              and a second Suspense flash before the user can click "Verify" is
              pure latency. */}
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          {/* Unknown path: an unmatched <Routes> renders NOTHING, so a stale
              bookmarked link lands on a blank screen. Surface it honestly — a
              full ambient 404 with a way Home/Back and a search box. */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default AppRoutes;