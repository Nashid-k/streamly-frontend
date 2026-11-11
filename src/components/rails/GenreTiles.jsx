import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../../api/movieService";
import { asArray } from "../../utils";
import SectionHeader from "./SectionHeader";

/**
 * Genre tiles (brief P2-11): one entry point per genre, each a real link into
 * Browse's existing `?genre=<id>` contract — no new route, no invented genre
 * list. It reuses the SAME React Query key DiscoveryPage owns
 * (`["discover-genres", "movie"]`), so arriving on Browse afterwards is instant.
 *
 * Deliberately a compact text tile rather than a poster mosaic: the home page
 * already spent its image budget on the rails above, and the brief asks for
 * scannable entry points, not another carousel.
 */
const MAX_TILES = 10;

const GenreTiles = React.memo(function GenreTiles() {
  const { data } = useQuery({
    queryKey: ["discover-genres", "movie"],
    queryFn: () => movieService.getGenres("movie"),
    staleTime: 1000 * 60 * 60,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const genres = useMemo(
    () =>
      asArray(data)
        .filter((g) => g && g.id != null && g.name)
        .slice(0, MAX_TILES),
    [data],
  );

  if (genres.length === 0) return null;

  return (
    <section className="genre-tiles" aria-label="Browse by genre">
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
              color: "var(--white)",
            }}
          >
            Browse by genre
          </h3>
        }
        seeAllTo="/movies"
        seeAllLabel="See all genres"
      />
      <ul className="genre-tiles__grid">
        {genres.map((genre) => (
          <li key={genre.id}>
            <Link
              to={`/movies?genre=${encodeURIComponent(genre.id)}`}
              className="genre-tile"
            >
              <span className="genre-tile__name">{genre.name}</span>
              <span className="genre-tile__arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
});

export default GenreTiles;
