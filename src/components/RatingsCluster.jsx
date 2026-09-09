import { useQuery } from "@tanstack/react-query";
import { Popcorn } from "lucide-react";
import { ratingService } from "../api/ratingService";
import { hasOmdbKey } from "../api/omdbClient";

const IMDB_LOGO =
  "https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg";
const RT_LOGO =
  "https://upload.wikimedia.org/wikipedia/commons/5/5b/Rotten_Tomatoes.svg";

/**
 * RatingsCluster — real rating badges for a title.
 *
 * • IMDb + Rotten Tomatoes come from OMDb (real third-party data) — only when
 *   OMDb has the title (key is hardcoded in src/api/omdbClient.js).
 * • The trailing badge is the TMDB community score (vote_average) — labeled
 *   honestly, rendered with a popcorn glyph.
 * Shows nothing if none of the three are available.
 */
export default function RatingsCluster({
  movie,
  size = "md",
  itemClassName = "",
  showTmdb = true,
}) {
  const { data: real } = useQuery({
    queryKey: ["realRatings", movie?.id],
    queryFn: () => ratingService.getRealRatings(movie),
    enabled: !!movie?.id && hasOmdbKey(),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 0,
    refetchOnWindowFocus: false, // OMDb is 1,000 req/day — don't burn quota
  });

  const imdbH = size === "sm" ? 10 : 14;
  const rtH = size === "sm" ? 12 : 16;
  const popcornSize = size === "sm" ? 11 : 15;
  const boldText = size === "lg" ? "" : "font-bold";

  return (
    <>
      {real?.imdb != null && real.imdb > 0 && (
        <span
          title="IMDb Rating"
          className={itemClassName || undefined}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            whiteSpace: "nowrap",
          }}
        >
          <img
            src={IMDB_LOGO}
            alt="IMDb"
            style={{ height: `${imdbH}px`, objectFit: "contain" }}
          />
          <span className={boldText}>{real.imdb.toFixed(1)}</span>
        </span>
      )}
      {real?.rt != null && real.rt > 0 && (
        <span
          title="Rotten Tomatoes"
          className={itemClassName || undefined}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            whiteSpace: "nowrap",
          }}
        >
          <img
            src={RT_LOGO}
            alt="Rotten Tomatoes"
            style={{ height: `${rtH}px`, objectFit: "contain" }}
          />
          <span className={boldText}>{Math.round(real.rt)}%</span>
        </span>
      )}
      {showTmdb && movie?.imdbRating > 0 && (
        <span
          title="TMDB Community Score"
          className={itemClassName || undefined}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            whiteSpace: "nowrap",
          }}
        >
          <Popcorn
            size={popcornSize}
            fill="currentColor"
            stroke="none"
            aria-hidden="true"
          />
          <span className={boldText}>{movie.imdbRating.toFixed(1)}</span>
        </span>
      )}
    </>
  );
}