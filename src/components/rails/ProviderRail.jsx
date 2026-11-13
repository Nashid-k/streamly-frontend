import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../../api/movieService";
import { asArray } from "../../utils";
import { reportQueryError } from "../../utils/debugLogger";
import { STREAMING_PROVIDERS, BROWSE_PROVIDERS } from "../../data/homeRailDomains";
import { useI18n } from "../../i18n/index.jsx";
import MovieRail from "./MovieRail";
import RailMenu from "./RailMenu";
import SectionHeader from "./SectionHeader";
import SkeletonRail from "../SkeletonRail";

/* ── Movies / TV Series on <provider> ──────────────────────────────────────
   Two rails whose subject is a streaming service rather than a genre. The
   row head is the shared RailMenu: the translated template ("Movies on
   {name}") supplies both the static prefix and the full title, so the label
   reads "Movies on" + the pickable provider name and stays translated.

   The provider filter reuses the discover endpoint's `providerId` (the same
   parameter Browse's `?provider=` filter uses), so switching service is one
   cached query — `placeholderData` keeps the previous row on screen while the
   new one lands. */
/* The picker shows each service's own mark. Logos live once, in the Browse-by-
   Provider rail's data (BROWSE_PROVIDERS, keyed by the same TMDB provider id),
   so the two provider surfaces can never disagree about a brand. */
const PROVIDER_LOGOS = new Map(BROWSE_PROVIDERS.map((p) => [p.id, p.logo]));
const PICKER_ITEMS = STREAMING_PROVIDERS.map((p) => ({
  id: p.id,
  label: p.name,
  logo: PROVIDER_LOGOS.get(p.id) || null,
}));

function ProviderRail({ mediaType = "movie" }) {
  const { t } = useI18n();
  const [providerId, setProviderId] = useState(STREAMING_PROVIDERS[0].id);

  const provider =
    STREAMING_PROVIDERS.find((p) => p.id === providerId) || STREAMING_PROVIDERS[0];
  const template = mediaType === "tv" ? "home.rails.providerShows" : "home.rails.providerMovies";
  // The template already reads "<prefix> {name}": the empty-name render is the
  // prefix for the row head, the full render is the translated rail title.
  const prefix = t(template, { name: "" }).trim();
  const title = t(template, { name: provider.name });

  const queryKey = ["home-provider-rail", mediaType, provider.id];
  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () =>
      movieService.getDiscover({
        mediaType,
        providerId: provider.id,
        sortBy: "popular",
        page: 1,
      }),
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
    // Keep the previous provider's row up while the new one loads.
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (isError) reportQueryError("ProviderRail", queryKey, error, { mediaType, providerId });
    // queryKey is rebuilt every render; its parts are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, error, mediaType, providerId]);

  const movies = useMemo(() => asArray(data), [data]);

  if (isLoading) return <SkeletonRail cards={8} />;

  const header = (
    <RailMenu
      label={prefix}
      valueLabel={provider.name}
      ariaLabel={title}
      activeId={provider.id}
      items={PICKER_ITEMS}
      onPick={setProviderId}
    />
  );

  // An empty service keeps its head on screen: hiding the rail outright would
  // take the picker with it and strand the viewer on an empty catalogue.
  if (movies.length === 0) {
    return (
      <div className="movie-rail-wrapper">
        <SectionHeader title={header} />
        <p className="rail-empty">{t("home.noTitles")}</p>
      </div>
    );
  }

  return (
    <MovieRail header={header} category={{ name: title, movies, dynamic: true }} />
  );
}

export default ProviderRail;
