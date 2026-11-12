import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../../api/movieService";
import { asArray } from "../../utils";
import { reportQueryError } from "../../utils/debugLogger";
import { useNearViewport } from "../../hooks/useNearViewport";
import {
  homeRailDayKey,
  pickHomeRailDomains,
  resolveRailRequest,
} from "../../data/homeRailDomains";
import ErrorBoundary from "../ErrorBoundary";
import MovieRail from "./MovieRail";
import FadeInSection from "./FadeInSection";

/* ── The rotating tail of the home feed ────────────────────────────────────
   Ten "domain" rails — a decade, a language, a mood, a medium — picked for the
   current day by a seeded shuffle of the recipe pool in
   src/data/homeRailDomains.js. The point is that today's ten are not
   yesterday's ten and today's order never shifts mid-session: the day key is
   the seed, so a re-mount or a back-navigation reproduces exactly the same
   rails while the calendar flips them overnight.

   Each row is its own discover query, and each one is viewport-gated (the
   recipe resolves to a request, not a fetch) so a cold home load fires four
   catalogue calls, not fourteen. A domain that cannot fill at least six
   titles hides itself instead of rendering a two-card stub. */

const RAIL_STALE_MS = 1000 * 60 * 10;
const MIN_TITLES = 6;
const MAX_TITLES = 20;

function RotatingRailRow({ domain, dayKey }) {
  const [sentinelRef, nearViewport] = useNearViewport();
  const request = useMemo(() => resolveRailRequest(domain), [domain]);
  const queryKey = useMemo(() => ["home-rail", dayKey, domain.key], [dayKey, domain.key]);

  const { data, isError, error } = useQuery({
    queryKey,
    queryFn: () => movieService.getDiscoverRail(request),
    enabled: nearViewport,
    staleTime: RAIL_STALE_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isError) {
      reportQueryError("HomePage", ["home-rail", dayKey, domain.key], error, {
        rail: domain.key,
      });
    }
  }, [isError, error, dayKey, domain.key]);

  const movies = useMemo(() => asArray(data).slice(0, MAX_TITLES), [data]);

  return (
    <div ref={sentinelRef}>
      {movies.length >= MIN_TITLES && (
        <FadeInSection>
          <ErrorBoundary>
            <MovieRail category={{ name: domain.label, movies, dynamic: true }} />
          </ErrorBoundary>
        </FadeInSection>
      )}
    </div>
  );
}

function RotatingRails({ filter = "all" }) {
  const dayKey = useMemo(() => homeRailDayKey(new Date()), []);
  const domains = useMemo(() => pickHomeRailDomains(new Date(), 10), []);

  const forThisTab = useMemo(() => {
    if (filter === "series" || filter === "tv shows")
      return domains.filter((d) => d.mediaType === "tv");
    if (filter === "movies") return domains.filter((d) => d.mediaType === "movie");
    return domains;
  }, [domains, filter]);

  return (
    <>
      {forThisTab.map((domain) => (
        <RotatingRailRow key={domain.key} domain={domain} dayKey={dayKey} />
      ))}
    </>
  );
}

export default RotatingRails;
