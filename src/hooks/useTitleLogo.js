import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import { useOptionalPreferences } from "../context/preferences";
import { logDebug, reportQueryError } from "../utils/debugLogger";
import { CdnImageAdapter } from "../api/cdnImageAdapter";

/* One rule for "which image is this title's logo", shared by the hero banner,
   the details hero and the player's loading stage.

   A list-fed movie carries no logoUrl, so it is fetched once per id from TMDB's
   /images endpoint and React Query caches it; the details payload only carries
   one when TMDB returned a logo for it. When the fetch comes back empty, the
   viewer turned image logos off, or the file itself fails to decode, this
   resolves to null so the caller draws the styled text title — a logo slot
   filled with the poster or backdrop art reads as a preview still of the title,
   not as a wordmark, which is what the player's cold-open stage used to do. */
export function useTitleLogo(movie, scope = "useTitleLogo", earlyId = null) {
  const prefs = useOptionalPreferences();
  const useImageLogos = prefs?.useImageLogos ?? true;
  const id = earlyId || movie?.id;
  const hasDetailLogo = !!movie?.logoUrl;
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [id]);

  const { data, error, isLoading: queryLoading } = useQuery({
    queryKey: ["titleLogo", id],
    queryFn: () => movieService.getTitleLogo(id),
    // Only the missing-logo case pays for the lookup: a details payload that
    // already carries the logo never hits /images again. `earlyId` lets the
    // fetch start in parallel with the details request instead of after it.
    enabled: !!id && useImageLogos && !hasDetailLogo,
    staleTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });

  useEffect(() => {
    if (error) {
      reportQueryError(scope, ["titleLogo", id], error, { id, title: movie?.title });
    }
  }, [error, id, movie?.title, scope]);

  const logoUrl = useImageLogos && !imageError
    ? CdnImageAdapter.getUrl(movie?.logoUrl || data || null, "w500")
    : null;

  // True only while the lookup is actually in flight (not a cached hit, and
  // not disabled because the details payload already carried a logo).
  const isLoading = !!id && useImageLogos && !hasDetailLogo && !movie?.logoUrl && queryLoading;

  useEffect(() => {
    if (!logoUrl && id && !isLoading) {
      logDebug(scope, `No logo for "${movie?.title}" — text title fallback is intentional, not an error.`, { id });
    }
  }, [logoUrl, id, isLoading, movie?.title, scope]);

  const onLogoError = useCallback(() => setImageError(true), []);

  return { logoUrl, useImageLogos, onLogoError, isLoading };
}

export default useTitleLogo;
