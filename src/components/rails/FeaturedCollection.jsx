import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { CdnImageAdapter } from "../../api/cdnImageAdapter";

/**
 * One wide editorial card between the hero strip and the rails (brief §6.3).
 *
 * Data source is the home feed itself: the first category with enough titles and
 * a landscape frame. That keeps it real (no invented query, no new React Query
 * key) and it links to the existing `/category/:name` route, passing the movies
 * through router state the same way MovieRail's "See all" already does.
 */
const FeaturedCollection = React.memo(function FeaturedCollection({ categories = [] }) {
  const collection = useMemo(() => {
    const usable = (Array.isArray(categories) ? categories : []).filter(
      (c) => c && Array.isArray(c.movies) && c.movies.length >= 5,
    );
    const chosen = usable.find((c) => c.movies.some((m) => m?.backdropUrl));
    if (!chosen) return null;
    const art = chosen.movies.find((m) => m?.backdropUrl);
    return {
      name: chosen.name,
      count: chosen.movies.length,
      art: CdnImageAdapter.getSrcSet(art.backdropUrl, "backdrop"),
      sizes: CdnImageAdapter.getSizes("backdrop"),
      movies: chosen.movies,
    };
  }, [categories]);

  if (!collection) return null;

  return (
    <section className="featured-collection" aria-label={`Featured collection: ${collection.name}`}>
      <Link
        to={`/category/${encodeURIComponent(collection.name)}`}
        state={{ movies: collection.movies, name: collection.name }}
        className="featured-collection__card"
      >
        <img
          srcSet={collection.art}
          sizes={collection.sizes}
          alt=""
          loading="lazy"
          decoding="async"
          className="featured-collection__art"
        />
        <div className="featured-collection__shade" aria-hidden="true" />
        <div className="featured-collection__body">
          <span className="featured-collection__eyebrow">Featured collection</span>
          <h3 className="featured-collection__title">{collection.name}</h3>
          <span className="featured-collection__meta">{collection.count} titles</span>
          <span className="featured-collection__cta">Explore</span>
        </div>
      </Link>
    </section>
  );
});

export default FeaturedCollection;
