import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { movieService, EDITORIAL_RAILS } from "../../api/movieService";
import { asArray } from "../../utils";
import { reportQueryError } from "../../utils/debugLogger";
import { useNearViewport } from "../../hooks/useNearViewport";
import ErrorBoundary from "../ErrorBoundary";
import MovieRail from "./MovieRail";
import FadeInSection from "./FadeInSection";

/* Cinejoy-style editorial rows (Oscar Nominees, Cannes, Top 100 Halloween,
   Mindf*ck Movies, ...). Each row resolves its own keyword-backed discover
   query; empty results hide the row, so a row only appears when the catalog
   can fill it. Gated to the "all" tab + neutral genre so they stay a curated
   home feature rather than repeating on every tab.

   Each row is also viewport-gated: nine rows x (keyword search + discover) used
   to fire the moment Home mounted, even for the rows nobody scrolled to. The
   wrapper div is always mounted (zero-height while empty) purely so the
   observer has something to watch. */
function EditorialRails({ filter, activeGenre }) {
  if (filter !== "all" || activeGenre !== "All") return null;
  return (
    <>
      {EDITORIAL_RAILS.map((cfg) => (
        <EditorialRailRow key={cfg.key} cfg={cfg} />
      ))}
    </>
  );
}

function EditorialRailRow({ cfg }) {
  const [sentinelRef, nearViewport] = useNearViewport();
  const { data, isError, error } = useQuery({
    queryKey: ["editorial", cfg.key],
    queryFn: () => movieService.getEditorialRail(cfg.key),
    enabled: nearViewport,
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isError) reportQueryError("HomePage", ["editorial", cfg.key], error, { rail: cfg.key });
  }, [isError, error, cfg.key]);

  const movies = asArray(data);

  return (
    <div ref={sentinelRef}>
      {movies.length > 0 && (
        <FadeInSection>
          <ErrorBoundary>
            <MovieRail railIndex={20} category={{ name: cfg.label, movies }} />
          </ErrorBoundary>
        </FadeInSection>
      )}
    </div>
  );
}

export default EditorialRails;