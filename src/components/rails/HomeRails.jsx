import React from "react";
import { Link } from "react-router-dom";
import ErrorBoundary from "../ErrorBoundary";
import ContinueWatchingRail from "../ContinueWatchingRail";
import SkeletonRail from "../SkeletonRail";
import FadeInSection from "./FadeInSection";
import MovieRail from "./MovieRail";
import BecauseSelector from "./BecauseSelector";
import ProviderRail from "./ProviderRail";
import BrowseByProviderRail from "./BrowseByProviderRail";
import RotatingRails from "./RotatingRails";
import { useAppAuth } from "../../context/auth";
import { useI18n } from "../../i18n/index.jsx";

/* Everything BELOW the hero, in the home feed's fixed order:
   1. Continue Watching (personal, only when there is history)
   2. Movies on <provider>     — dropdown: Netflix / Hulu / Disney+ / Prime
   3. TV Series on <provider>    Video / Max / Apple TV+
   4. Because you watched (personal, needs history)
   5. My List (personal, needs saved titles)
   6. Trending Movies
   7. Trending Series
   8. Ten rotating domain rails — a date-seeded pick, so the tail of the page is
      different tomorrow without ever re-ordering while you browse
   9. "Explore all" terminator

   i.e. the viewer's own stuff (resume, services they subscribe to, their
   history, their saves) comes first; the catalogue's start-from-scratch rails —
   trending, then the rotating tail — follow it.

   There is no Top 10 row, no genre showcase and no static "Top Rated" row any
   more: the rank row was removed site-wide, and the rotating recipes cover the
   fixed rows' ground (including a best-rated rail) without repeating the same
   three rows every visit.

   It is memoised on purpose — the hero owns its rotation and hover state back
   in HomePage, and every tick of that state used to re-render this whole
   subtree (a dozen rails × a row of cards each) on the main thread every 10
   seconds and on every banner hover. All inputs are useMemo'd query results /
   primitives upstream, so a hero tick now stops at this boundary; real changes
   (language, list edits, fresh query data) still flow through and re-render it
   normally. `continueWatching`/`myList` come straight from context here —
   identity only changes when the data does. */
const HomeRails = React.memo(function HomeRails({
  loading,
  filter,
  railsSentinelRef,
  trendingMovies,
  trendingSeries,
  becauseAnchor,
  onBecauseAnchorChange,
  recommendations,
}) {
  const { t } = useI18n();
  const { continueWatching, myList } = useAppAuth();

  const showMovies = filter !== "series" && filter !== "tv shows";
  const showSeries = filter !== "movies";

  return (
    <section ref={railsSentinelRef} className="home-rails-section">
      {/* Continue Watching — resume-first, above the catalogue rows. Marked as
          the lead row so rails.css does NOT pull it under the hero with the
          catalogue rows' negative tuck: it owns its own top spacing. */}
      {!loading && continueWatching && continueWatching.length > 0 && (
        <FadeInSection className="home-rails-lead">
          <ErrorBoundary>
            <ContinueWatchingRail items={continueWatching} />
          </ErrorBoundary>
        </FadeInSection>
      )}

      {/* Browse by Provider rail — 17 streaming services with logos */}
      {!loading && (
        <FadeInSection>
          <ErrorBoundary>
            <BrowseByProviderRail />
          </ErrorBoundary>
        </FadeInSection>
      )}

      {loading ? (
        <div className="home-rails-skeleton">
          {[1, 2, 3, 4].map((rail) => <SkeletonRail key={rail} cards={8} />)}
        </div>
      ) : (
        <>
          {/* 1. Because you watched — personalized ranker, anchor picker head */}
          {becauseAnchor && recommendations?.length > 0 && (
            <FadeInSection>
              <ErrorBoundary>
                <MovieRail
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
            </FadeInSection>
          )}

          {/* 2. Trending Movies */}
          {showMovies && trendingMovies.length > 0 && (
            <FadeInSection>
              <ErrorBoundary>
                <MovieRail
                  category={{
                    name: t("home.rails.trendingMovies"),
                    movies: trendingMovies,
                  }}
                />
              </ErrorBoundary>
            </FadeInSection>
          )}

          {/* 3. Trending Series */}
          {showSeries && trendingSeries.length > 0 && (
            <FadeInSection>
              <ErrorBoundary>
                <MovieRail
                  category={{
                    name: t("home.rails.trendingSeries"),
                    movies: trendingSeries,
                  }}
                />
              </ErrorBoundary>
            </FadeInSection>
          )}

          {/* 4–5. Provider rails — each head is a service dropdown */}
          {showMovies && (
            <FadeInSection>
              <ErrorBoundary>
                <ProviderRail mediaType="movie" />
              </ErrorBoundary>
            </FadeInSection>
          )}
          {showSeries && (
            <FadeInSection>
              <ErrorBoundary>
                <ProviderRail mediaType="tv" />
              </ErrorBoundary>
            </FadeInSection>
          )}

          {/* 6. My List */}
          {myList && myList.length > 0 && filter === "all" && (
            <FadeInSection>
              <ErrorBoundary>
                <MovieRail
                  category={{ name: t("home.rails.myList"), movies: myList }}
                />
              </ErrorBoundary>
            </FadeInSection>
          )}

          {/* 7. Ten rotating domain rails (date-seeded) */}
          <RotatingRails filter={filter} />

          {/* 8. Explore all — terminates the feed instead of growing forever */}
          <div className="home-explore-all">
            <Link to="/movies" className="home-explore-all__link">
              Explore all
            </Link>
          </div>
        </>
      )}
    </section>
  );
});

export default HomeRails;
