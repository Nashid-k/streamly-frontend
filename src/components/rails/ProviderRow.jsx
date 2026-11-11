import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../../api/movieService";
import { asArray } from "../../utils";
import SectionHeader from "./SectionHeader";

/**
 * Home "Browse by Provider" row. Reuses the SAME React Query key DiscoveryPage
 * already owns (`["discover-providers", mediaType]`) instead of adding a
 * contract entry, so opening Browse afterwards paints from cache.
 *
 * Each chip links to `/movies?provider=<id>`, which is the filter DiscoveryPage
 * already reads (`providerParam`). No new route, no new query key.
 */
const ProviderRow = React.memo(function ProviderRow() {
  const { data } = useQuery({
    queryKey: ["discover-providers", "movie"],
    queryFn: () => movieService.getWatchProviders("movie"),
    staleTime: 1000 * 60 * 60 * 24,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const providers = useMemo(
    () => asArray(data).filter((p) => p && p.logoUrl).slice(0, 12),
    [data],
  );

  if (providers.length === 0) return null;

  return (
    <section className="provider-row" aria-label="Browse by Provider">
      <SectionHeader
        title={
          <h3
            className="rail-title"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "20px",
              fontWeight: "var(--weight-display)",
              margin: 0,
              letterSpacing: "var(--tracking-display)",
              color: "#ffffff",
            }}
          >
            Browse by Provider
          </h3>
        }
        seeAllTo="/movies"
        seeAllLabel="All providers"
      />
      <div className="provider-row__track">
        {providers.map((provider) => (
          <Link
            key={provider.id}
            to={`/movies?provider=${encodeURIComponent(provider.id)}`}
            className="provider-chip"
            aria-label={provider.name}
            title={provider.name}
          >
            <img
              src={provider.logoUrl}
              alt=""
              width={32}
              height={32}
              loading="lazy"
              decoding="async"
              className="provider-chip__logo"
            />
          </Link>
        ))}
      </div>
    </section>
  );
});

export default ProviderRow;
