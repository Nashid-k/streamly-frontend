import React, { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Film, Home, Grid } from "lucide-react";
import { BROWSE_PROVIDERS } from "../data/homeRailDomains";
import { CURATED_PROVIDER_TITLES } from "../data/providerCatalog";
import { movieService } from "../api/movieService";
import MovieCard from "../components/MovieCard";
import AmbientBackground from "../components/AmbientBackground";
import { reportQueryError } from "../utils/debugLogger";

export default function ProviderPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const rawId = params.providerId || params.id || searchParams.get("id");

  const [tab, setTab] = useState("movies");

  // Scroll to top on mount or provider change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [rawId]);

  // Lookup provider in BROWSE_PROVIDERS
  const provider = useMemo(() => {
    if (!rawId) return null;
    return (
      BROWSE_PROVIDERS.find(
        (p) =>
          String(p.id) === String(rawId) ||
          p.name.toLowerCase().replace(/[^a-z0-9]/g, "") ===
            String(rawId).toLowerCase().replace(/[^a-z0-9]/g, ""),
      ) || null
    );
  }, [rawId]);

  // Set document title
  useEffect(() => {
    if (provider) {
      document.title = `${provider.name} — Cinejoy`;
    } else {
      document.title = "Provider Not Found — Cinejoy";
    }
  }, [provider]);

  // Fetch movies for this provider
  const moviesQuery = useQuery({
    queryKey: ["discover", "movie", provider?.id],
    queryFn: () =>
      movieService.getDiscover({
        mediaType: "movie",
        providerId: provider?.id,
      }),
    enabled: Boolean(provider?.id),
    staleTime: 10 * 60 * 1000,
  });

  // Fetch series for this provider
  const seriesQuery = useQuery({
    queryKey: ["discover", "tv", provider?.id],
    queryFn: () =>
      movieService.getDiscover({
        mediaType: "tv",
        providerId: provider?.id,
      }),
    enabled: Boolean(provider?.id),
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (moviesQuery.error && provider) {
      reportQueryError("ProviderPage", ["discover", "movie", provider.id], moviesQuery.error);
    }
    if (seriesQuery.error && provider) {
      reportQueryError("ProviderPage", ["discover", "tv", provider.id], seriesQuery.error);
    }
  }, [moviesQuery.error, seriesQuery.error, provider]);

  // Resolve movies (live API data || curated catalog)
  const movies = useMemo(() => {
    if (moviesQuery.data && moviesQuery.data.length > 0) return moviesQuery.data;
    if (provider?.id && CURATED_PROVIDER_TITLES[provider.id]?.movies) {
      return CURATED_PROVIDER_TITLES[provider.id].movies;
    }
    return [];
  }, [moviesQuery.data, provider?.id]);

  // Resolve series (live API data || curated catalog)
  const series = useMemo(() => {
    if (seriesQuery.data && seriesQuery.data.length > 0) return seriesQuery.data;
    if (provider?.id && CURATED_PROVIDER_TITLES[provider.id]?.series) {
      return CURATED_PROVIDER_TITLES[provider.id].series;
    }
    return [];
  }, [seriesQuery.data, provider?.id]);

  const activeItems = tab === "movies" ? movies : series;
  const isLoading = (tab === "movies" ? moviesQuery.isLoading : seriesQuery.isLoading) && activeItems.length === 0;

  // Pick ambient backdrop
  const ambientSrc = useMemo(() => {
    const list = activeItems.length > 0 ? activeItems : tab === "movies" ? series : movies;
    return list.find((item) => item.backdropUrl || item.posterUrl)?.backdropUrl || list[0]?.posterUrl || null;
  }, [activeItems, tab, series, movies]);

  // 404 state
  if (!provider) {
    return (
      <div className="provider-page">
        <AmbientBackground fallback />
        <div className="provider-empty">
          <Grid className="icon" size={48} />
          <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text-strong)", marginBottom: 8 }}>
            Provider not found
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            We couldn't find that provider. Try another from the home page.
          </p>
          <Link className="btn btn--primary" to="/" style={{ marginTop: 20 }}>
            <Home className="icon" size={18} style={{ marginRight: 8 }} /> Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="provider-page">
      <AmbientBackground src={ambientSrc} fallback />

      {/* Hero Header */}
      <div className="provider-hero">
        <div className="provider-hero__logo">
          <img src={provider.logo} alt={provider.name} loading="eager" decoding="async" />
        </div>
        <h1 className="provider-hero__name">{provider.name}</h1>
      </div>

      {/* Tab toggle */}
      <div className="provider-toggle-row">
        <div className="provider-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "movies"}
            className={tab === "movies" ? "is-active" : ""}
            onClick={() => setTab("movies")}
          >
            Movies
            <span className="count">{movies.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "series"}
            className={tab === "series" ? "is-active" : ""}
            onClick={() => setTab("series")}
          >
            Series
            <span className="count">{series.length}</span>
          </button>
        </div>
      </div>

      {/* Grid or Skeleton */}
      {isLoading ? (
        <div className="skeleton-grid" style={{ padding: "0 var(--gutter, 24px) 60px" }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="sk-card">
              <div className="skeleton sk-card__poster" />
              <div className="sk-card__cap">
                <div className="skeleton sk-card__line" />
                <div className="skeleton sk-card__line sk-card__line--short" />
              </div>
            </div>
          ))}
        </div>
      ) : activeItems.length === 0 ? (
        <div className="provider-empty">
          <Film className="icon" size={48} />
          No titles available for this provider yet.
        </div>
      ) : (
        <div className="provider-grid" id="provider-grid">
          {activeItems.map((item, index) => (
            <MovieCard key={item.id || item.imdbId || index} movie={item} />
          ))}
        </div>
      )}
    </div>
  );
}
