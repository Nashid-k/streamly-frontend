import React from "react";
import { Link } from "react-router-dom";
import ErrorBoundary from "../ErrorBoundary";
import ContinueWatchingRail from "../ContinueWatchingRail";
import GenreShowcase from "../GenreShowcase";
import SkeletonRail from "../SkeletonRail";
import FadeInSection from "./FadeInSection";
import MovieRail from "./MovieRail";
import Top10Rail from "./Top10Rail";
import EditorialRails from "./EditorialRails";
import GenreTiles from "./GenreTiles";
import ProviderRow from "./ProviderRow";
import { useAppAuth } from "../../context/auth";
import { useI18n } from "../../i18n/index.jsx";

/* Everything BELOW the hero: Continue Watching, Browse-by-Provider,
   Because-you-watched and the category rails. It is memoised on purpose — the hero owns its rotation and
   hover state back in HomePage, and every tick of that state used to re-render
   this whole subtree (a dozen rails × a row of cards each) on the main thread
   every 10 seconds and on every banner hover. All inputs are useMemo'd query
   results / primitives upstream, so a hero tick now stops at this boundary;
   real changes (language, genre tab, list edits, fresh query data) still flow
   through and re-render it normally. `continueWatching`/`myList` come straight
   from context here — identity only changes when the data does. */
const HomeRails = React.memo(function HomeRails({
  loading,
  filter,
  activeGenre,
  railsSentinelRef,
  catEndRef,
  sectionTitle,
  categories,
  visibleCatCount,
  lastWatched,
  recommendations,
  top10Movies,
  trendingThisWeek,
  topRated,
}) {
  const { t } = useI18n();
  const { continueWatching, myList } = useAppAuth();

  return (
    <>
      {/* Continue Watching — resume-first; right below the hero, on every tab */}
      {!loading && continueWatching && continueWatching.length > 0 && (
        <FadeInSection style={{ marginTop: "clamp(1.75rem, 3.5vw, 2.75rem)" }}>
          <ErrorBoundary>
            <ContinueWatchingRail railIndex={0} items={continueWatching} />
          </ErrorBoundary>
        </FadeInSection>
      )}

      {/* Browse by Provider — sits directly below Continue Watching; the full
          provider slate, each chip linking to the existing
          /movies?provider=<id> filter. */}
      {!loading && filter === "all" && activeGenre === "All" && (
        <FadeInSection style={{ marginTop: "clamp(1.75rem, 3.5vw, 2.75rem)" }}>
          <ErrorBoundary>
            <ProviderRow />
          </ErrorBoundary>
        </FadeInSection>
      )}

      {/* Because you watched — personalized discovery ranker, right after the
          providers. */}
      {!loading && filter === "all" && lastWatched && recommendations?.length > 0 && (
        <FadeInSection style={{ marginTop: "clamp(1.75rem, 3.5vw, 2.75rem)" }}>
          <ErrorBoundary>
            <MovieRail
              railIndex={1}
              category={{
                name: t("home.rails.becauseWatched", { title: lastWatched.title }),
                movies: recommendations,
              }}
            />
          </ErrorBoundary>
        </FadeInSection>
      )}

      {/* Categories Section */}
      <section
        ref={railsSentinelRef}
        style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}
      >
        <div className="section-header" style={{ marginBottom: 0 }}>
          <h2 className="section-title">{sectionTitle}</h2>
        </div>

        {loading ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}
          >
            {[1, 2, 3, 4].map((rail) => <SkeletonRail key={rail} cards={8} />)}
          </div>
        ) : categories.length === 0 ? (
          <h3 style={{ textAlign: "center", color: "var(--text-secondary)" }}>
            {t("home.noTitles")}
          </h3>
        ) : (
          <>
            {/* Top 10 — social proof & fresh discovery. Because-you-watched and
                the provider row now sit above this section, directly under
                Continue Watching. */}
            {(filter === "all" ||
              filter === "series" ||
              filter === "tv shows" ||
              filter === "movies") &&
              top10Movies.length > 0 &&
              activeGenre === "All" && (
                <FadeInSection>
                  <Top10Rail
                    railIndex={2}
                    movies={top10Movies}
                    filter={filter}
                  />
                </FadeInSection>
              )}
            {/* 4. Trending This Week */}
            {trendingThisWeek.length > 0 && activeGenre === "All" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={3}
                    category={{ name: t("home.rails.trendingThisWeek"), movies: trendingThisWeek }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}
            {/* 5. Top Rated — the algorithmic set is capped at three rails on
                purpose (trending / because-you-watched / top rated). "Airing
                This Week", "Popular Now" and "Now Playing" were the same
                catalogue re-sorted and are reachable from Browse filters, so
                they no longer add page height here. */}
            {topRated.length > 0 && activeGenre === "All" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={6}
                    category={{ name: t("home.rails.topRated"), movies: topRated }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}
            {/* 6. Cinejoy-style editorial curated rows (capped at three) */}
            <EditorialRails filter={filter} activeGenre={activeGenre} />

            {/* 10. My List */}
            {myList && myList.length > 0 && filter === "all" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={8}
                    category={{ name: t("home.rails.myList"), movies: myList }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}

            {/* 11. Genre showcase — Streamly/Prime-style rows (tab-aware) */}
            <ErrorBoundary>
              <GenreShowcase filter={filter} activeGenre={activeGenre} />
            </ErrorBoundary>

            {/* 11b. Genre entry points — one tile per genre, real filter links */}
            {activeGenre === "All" && (
              <ErrorBoundary>
                <GenreTiles />
              </ErrorBoundary>
            )}

            {/* 12. Category rails — capped at three so the page terminates
                (brief: ~8 rails, not an infinite feed). */}
            {categories.slice(0, Math.min(visibleCatCount, 3)).map((category, catIdx) => (
              <FadeInSection key={catIdx} delay={0.1}>
                <ErrorBoundary key={category.id || catIdx}>
                  <MovieRail railIndex={catIdx + 9} category={category} />
                </ErrorBoundary>
              </FadeInSection>
            ))}
            {/* Explore all — terminates the feed instead of growing forever. */}
            <div className="home-explore-all">
              <Link to="/movies" className="home-explore-all__link">
                Explore all
              </Link>
            </div>
            {/* End sentinel: HomePage's useFeedSentinel grows this feed when
                it sits inside the viewport margin. */}
            <div ref={catEndRef} className="h-px" aria-hidden="true" />
          </>
        )}
      </section>
    </>
  );
});

export default HomeRails;
