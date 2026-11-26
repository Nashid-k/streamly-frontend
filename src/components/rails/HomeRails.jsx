import React from "react";

import ErrorBoundary from "../ErrorBoundary";
import ContinueWatchingRail from "../ContinueWatchingRail";
import HomeSkeletonRail from "../home/HomeSkeletonRail";
import MovieRail from "./MovieRail";
import BecauseSelector from "./BecauseSelector";
import ProviderRail from "./ProviderRail";
import BrowseByProviderRail from "./BrowseByProviderRail";
import RotatingRails from "./RotatingRails";
import { useAppAuth } from "../../context/auth";
import { BROWSE_PROVIDERS } from "../../data/homeRailDomains";
import { useI18n } from "../../i18n/index.jsx";

/* Everything below the hero, in the feed's fixed order. The entire surface is
   built from the canonical `.sh/.rail/.cw` vocabulary — no legacy wrappers,
   curtain metadata or row headers survive on this route. */
const HomeRails = React.memo(function HomeRails({
  loading,
  filter,
  railsSentinelRef,
  trendingMovies,
  trendingSeries,
  becauseAnchor,
  onBecauseAnchorChange,
  recommendations,
  recommendationsLoading = false,
}) {
  const { t } = useI18n();
  const { continueWatching, myList } = useAppAuth();

  const showMovies = filter !== "series" && filter !== "tv shows";
  const showSeries = filter !== "movies";
  const hasContinue = Array.isArray(continueWatching) && continueWatching.length > 0;
  const hasMyList = Array.isArray(myList) && myList.length > 0 && filter === "all";
  const hasBecause = Boolean(becauseAnchor);

  const skeletonRows = [];
  if (hasContinue) {
    skeletonRows.push({
      key: "continue",
      cards: Math.min(continueWatching.length, 8),
      label: t("home.rails.continueWatching"),
      scene: "continue",
    });
  }
  skeletonRows.push({
    key: "provider-browse",
    cards: BROWSE_PROVIDERS.length,
    label: "Browse by Provider",
    scene: "provider",
  });
  if (hasBecause) {
    skeletonRows.push({
      key: "because",
      cards: 8,
      label: t("home.rails.becauseWatched"),
      scene: "because",
      headVariant: "menu",
    });
  }
  if (showMovies) {
    skeletonRows.push({
      key: "trending-movies",
      cards: 8,
      label: t("home.rails.trendingMovies"),
      scene: "trending-movies",
    });
  }
  if (showSeries) {
    skeletonRows.push({
      key: "trending-series",
      cards: 8,
      label: t("home.rails.trendingSeries"),
      scene: "trending-series",
    });
  }
  if (showMovies) {
    skeletonRows.push({
      key: "provider-movie",
      cards: 8,
      label: t("home.rails.providerMovies", { name: "" }).trim(),
      scene: "provider-rail",
      headVariant: "menu",
    });
  }
  if (showSeries) {
    skeletonRows.push({
      key: "provider-tv",
      cards: 8,
      label: t("home.rails.providerShows", { name: "" }).trim(),
      scene: "provider-rail",
      headVariant: "menu",
    });
  }
  if (hasMyList) {
    skeletonRows.push({
      key: "my-list",
      cards: Math.min(myList.length, 8),
      label: t("home.rails.myList"),
      scene: "my-list",
    });
  }

  let rowIdx = 0;
  const nextRowIndex = () => rowIdx++;

  return (
    <section ref={railsSentinelRef} className="home-rails-section">
      {loading ? (
        <div className="home-rails-skeleton" aria-label="Loading home recommendations">
          {skeletonRows.map((row, index) => (
            <HomeSkeletonRail
              key={row.key}
              cards={row.cards}
              label={row.label}
              scene={row.scene}
              headVariant={row.headVariant}
              rowIndex={index}
            />
          ))}
        </div>
      ) : (
        <>
          {hasContinue && (
            <ErrorBoundary>
              <ContinueWatchingRail items={continueWatching} rowIndex={nextRowIndex()} />
            </ErrorBoundary>
          )}

          <ErrorBoundary>
            <BrowseByProviderRail rowIndex={nextRowIndex()} />
          </ErrorBoundary>

          {hasBecause && recommendationsLoading && recommendations.length === 0 ? (
            <HomeSkeletonRail
              cards={8}
              headVariant="menu"
              label={t("home.rails.becauseWatched")}
              scene="because"
              rowIndex={nextRowIndex()}
            />
          ) : (
            hasBecause &&
            recommendations?.length > 0 && (
              <ErrorBoundary>
                <MovieRail
                  rowIndex={nextRowIndex()}
                  category={{
                    name: t("home.rails.becauseWatched"),
                    movies: recommendations,
                    dynamic: true,
                  }}
                  header={
                    <BecauseSelector
                      anchor={becauseAnchor}
                      items={continueWatching}
                      onPick={onBecauseAnchorChange}
                    />
                  }
                />
              </ErrorBoundary>
            )
          )}

          {showMovies && trendingMovies?.length > 0 && (
            <ErrorBoundary>
              <MovieRail
                rowIndex={nextRowIndex()}
                category={{
                  name: t("home.rails.trendingMovies"),
                  movies: trendingMovies,
                }}
              />
            </ErrorBoundary>
          )}

          {showSeries && trendingSeries?.length > 0 && (
            <ErrorBoundary>
              <MovieRail
                rowIndex={nextRowIndex()}
                category={{
                  name: t("home.rails.trendingSeries"),
                  movies: trendingSeries,
                }}
              />
            </ErrorBoundary>
          )}

          {showMovies && (
            <ErrorBoundary>
              <ProviderRail mediaType="movie" rowIndex={nextRowIndex()} />
            </ErrorBoundary>
          )}
          {showSeries && (
            <ErrorBoundary>
              <ProviderRail mediaType="tv" rowIndex={nextRowIndex()} />
            </ErrorBoundary>
          )}

          {hasMyList && (
            <ErrorBoundary>
              <MovieRail
                rowIndex={nextRowIndex()}
                category={{ name: t("home.rails.myList"), movies: myList }}
              />
            </ErrorBoundary>
          )}

          <RotatingRails filter={filter} />
        </>
      )}
    </section>
  );
});

export default HomeRails;
