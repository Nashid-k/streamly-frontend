import React from "react";
import ErrorBoundary from "../ErrorBoundary";
import ContinueWatchingRail from "../ContinueWatchingRail";
import LeavingSoonBanner from "../LeavingSoonBanner";
import GenreShowcase from "../GenreShowcase";
import SkeletonRail from "../SkeletonRail";
import FadeInSection from "./FadeInSection";
import MovieRail from "./MovieRail";
import Top10Rail from "./Top10Rail";
import EditorialRails from "./EditorialRails";
import { useAppAuth } from "../../context/auth";
import { useI18n } from "../../i18n/index.jsx";

/* Everything BELOW the hero: Leaving Soon, Upcoming, Continue Watching and the
   category rails. It is memoised on purpose — the hero owns its rotation and
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
  leavingSoonItems,
  upcomingReleases,
  upcomingTitle,
  railsSentinelRef,
  sectionTitle,
  categories,
  visibleCatCount,
  lastWatched,
  recommendations,
  top10Movies,
  trendingThisWeek,
  airingThisWeek,
  popularNow,
  topRated,
  nowPlaying,
}) {
  const { t } = useI18n();
  const { continueWatching, myList } = useAppAuth();

  return (
    <>
      {/* Leaving Soon — home page only */}
      {!loading && filter === 'all' && activeGenre === 'All' && (
        <LeavingSoonBanner items={leavingSoonItems} />
      )}

      {/* Upcoming — standard rail UI on every tab; tab-filtered (all on Home,
          movies/series on their pages) and padded so the rail always fills. */}
      {!loading && activeGenre === "All" && upcomingReleases.length > 0 && (
        <FadeInSection style={{ marginTop: "clamp(1.75rem, 3.5vw, 2.75rem)" }}>
          <ErrorBoundary>
            <MovieRail
              railIndex={0}
              category={{ name: upcomingTitle, movies: upcomingReleases }}
            />
          </ErrorBoundary>
        </FadeInSection>
      )}

      {/* Continue Watching — resume-first; right below the hero, on every tab */}
      {!loading && continueWatching && continueWatching.length > 0 && (
        <FadeInSection style={{ marginTop: "clamp(1.75rem, 3.5vw, 2.75rem)" }}>
          <ErrorBoundary>
            <ContinueWatchingRail railIndex={0} items={continueWatching} />
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
          <h3 style={{ textAlign: "center", color: "#a1a1aa" }}>
            {t("home.noTitles")}
          </h3>
        ) : (
          <>
            {/* Because you watched — personalized discovery ranker */}
            {filter === "all" && lastWatched && recommendations?.length > 0 && (
              <FadeInSection>
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
            {/* 3. Top 10 — social proof & fresh discovery */}
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
            {/* 5. Airing This Week — currently-airing TV, the "On the Air" row */}
            {airingThisWeek.length > 0 && activeGenre === "All" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={4}
                    category={{ name: t("home.rails.airingThisWeek"), movies: airingThisWeek }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}
            {/* 6. Popular Now */}
            {popularNow.length > 0 && activeGenre === "All" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={5}
                    category={{ name: t("home.rails.popularNow"), movies: popularNow }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}
            {/* 7. Top Rated */}
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
            {/* 8. Now Playing / In Theaters */}
            {nowPlaying.length > 0 && activeGenre === "All" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={7}
                    category={{ name: t("home.rails.nowPlaying"), movies: nowPlaying }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}

            {/* 9. Cinejoy-style editorial curated rows */}
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

            {/* 11. Genre showcase — Netflix/Prime-style rows (tab-aware) */}
            <ErrorBoundary>
              <GenreShowcase filter={filter} activeGenre={activeGenre} />
            </ErrorBoundary>

            {/* 12. Category rails */}
            {categories.slice(0, visibleCatCount).map((category, catIdx) => (
              <FadeInSection key={catIdx} delay={0.1}>
                <ErrorBoundary key={category.id || catIdx}>
                  <MovieRail railIndex={catIdx + 9} category={category} />
                </ErrorBoundary>
              </FadeInSection>
            ))}
          </>
        )}
      </section>
    </>
  );
});

export default HomeRails;
