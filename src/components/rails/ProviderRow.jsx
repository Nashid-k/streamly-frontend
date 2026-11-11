import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { movieService } from "../../api/movieService";
import { asArray } from "../../utils";
import SectionHeader from "./SectionHeader";
import MovieRail from "./MovieRail";
import SkeletonRail from "../SkeletonRail";
import { useI18n } from "../../i18n/index.jsx";

/**
 * Home "Browse by Provider" row. The provider list reuses the SAME React
 * Query key DiscoveryPage already owns (`["discover-providers", mediaType]`)
 * instead of adding a contract entry, so opening Browse afterwards paints
 * from cache.
 *
 * A chip no longer navigates to the Movies/Series browse page: clicking one
 * expands that provider's catalogue INLINE on home — "Movies on X" / "TV
 * Series on X" rails fed by the discover endpoint's provider filter (the one
 * DiscoveryPage reads for `?provider=`). Clicking the active chip (or the ×)
 * collapses it; "All providers" still leads to Browse.
 */

const PROVIDER_TITLES_STALE = 1000 * 60 * 5;

const railTitleStyle = {
  fontFamily: "var(--font-display)",
  fontSize: "20px",
  fontWeight: "var(--weight-display)",
  margin: 0,
  letterSpacing: "var(--tracking-display)",
  color: "var(--white)",
};

function ProviderInline({ provider, onClose }) {
  const { t } = useI18n();

  const moviesQ = useQuery({
    queryKey: ["provider-titles", provider.id, "movie"],
    queryFn: () =>
      movieService.getDiscover({
        mediaType: "movie",
        providerId: provider.id,
        sortBy: "popular",
        page: 1,
      }),
    staleTime: PROVIDER_TITLES_STALE,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const showsQ = useQuery({
    queryKey: ["provider-titles", provider.id, "tv"],
    queryFn: () =>
      movieService.getDiscover({
        mediaType: "tv",
        providerId: provider.id,
        sortBy: "popular",
        page: 1,
      }),
    staleTime: PROVIDER_TITLES_STALE,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const movies = useMemo(() => asArray(moviesQ.data), [moviesQ.data]);
  const shows = useMemo(() => asArray(showsQ.data), [showsQ.data]);
  const loading = moviesQ.isLoading || showsQ.isLoading;
  const empty = !loading && movies.length === 0 && shows.length === 0;

  return (
    <div className="provider-inline">
      <div className="provider-inline__bar">
        <h3 className="rail-title" style={railTitleStyle}>
          {provider.name}
        </h3>
        <button
          type="button"
          className="provider-inline__close"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {loading ? (
        <div className="provider-inline__loading">
          <SkeletonRail cards={8} />
          <SkeletonRail cards={8} />
        </div>
      ) : empty ? (
        <p className="provider-inline__empty">{t("home.noTitles")}</p>
      ) : (
        <>
          {movies.length > 0 && (
            <MovieRail
              category={{
                name: t("home.rails.providerMovies", { name: provider.name }),
                movies,
                dynamic: true,
              }}
            />
          )}
          {shows.length > 0 && (
            <MovieRail
              category={{
                name: t("home.rails.providerShows", { name: provider.name }),
                movies: shows,
                dynamic: true,
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

const ProviderRow = React.memo(function ProviderRow() {
  const { data } = useQuery({
    queryKey: ["discover-providers", "movie"],
    queryFn: () => movieService.getWatchProviders("movie"),
    staleTime: 1000 * 60 * 60 * 24,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const providers = useMemo(
    () => asArray(data).filter((p) => p && p.logoUrl),
    [data],
  );

  const [selected, setSelected] = useState(null);

  if (providers.length === 0) return null;

  return (
    <section className="provider-row" aria-label="Browse by Provider">
      <SectionHeader
        title={
          <h3 className="rail-title" style={railTitleStyle}>
            Browse by Provider
          </h3>
        }
        seeAllTo="/movies"
        seeAllLabel="All providers"
      />
      <div className="provider-row__track">
        {providers.map((provider) => {
          const active = selected?.id === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              className={`provider-chip${active ? " provider-chip--active" : ""}`}
              aria-label={provider.name}
              aria-pressed={active}
              title={provider.name}
              onClick={() =>
                setSelected((cur) => (cur?.id === provider.id ? null : provider))
              }
            >
              <img
                src={provider.logoUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="provider-chip__logo w-full h-full object-cover"
              />
            </button>
          );
        })}
      </div>
      {selected && (
        <ProviderInline
          provider={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
});

export default ProviderRow;
