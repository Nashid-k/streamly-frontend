import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { movieService } from "../../api/movieService";
import { asArray } from "../../utils";
import { reportQueryError } from "../../utils/debugLogger";
import { STREAMING_PROVIDERS, BROWSE_PROVIDERS } from "../../data/homeRailDomains";
import { useI18n } from "../../i18n/index.jsx";
import HomeCard from "../home/HomeCard";
import HomeRail from "../home/HomeRail";
import HomeSkeletonRail from "../home/HomeSkeletonRail";
import RailMenu from "./RailMenu";

/* Movies / TV Series on <provider> — the row head is the shared picker, the
   cards and shell are the canonical 2.0 home surfaces. */
const PROVIDER_LOGOS = new Map(BROWSE_PROVIDERS.map((provider) => [provider.id, provider.logo]));
const PICKER_ITEMS = STREAMING_PROVIDERS.map((provider) => ({
  id: provider.id,
  label: provider.name,
  logo: PROVIDER_LOGOS.get(provider.id) || null,
}));

function ProviderRail({ mediaType = "movie", rowIndex }) {
  const { t } = useI18n();
  const [providerId, setProviderId] = useState(STREAMING_PROVIDERS[0].id);

  const provider =
    STREAMING_PROVIDERS.find((item) => item.id === providerId) || STREAMING_PROVIDERS[0];
  const template = mediaType === "tv" ? "home.rails.providerShows" : "home.rails.providerMovies";
  const prefix = t(template, { name: "" }).trim();
  const title = t(template, { name: provider.name });

  const queryKey = ["home-provider-rail", mediaType, provider.id];
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
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
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (isError) reportQueryError("ProviderRail", queryKey, error, { mediaType, providerId });
    // queryKey is rebuilt every render; its parts are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, error, mediaType, providerId]);

  const movies = useMemo(() => asArray(data), [data]);

  if (isLoading) {
    return (
      <HomeSkeletonRail
        cards={8}
        label={prefix || title}
        scene="provider-rail"
        headVariant="menu"
        rowIndex={rowIndex ?? (mediaType === "tv" ? 5 : 4)}
      />
    );
  }

  const header = (
    <RailMenu
      label={prefix}
      valueLabel={provider.name}
      ariaLabel={title}
      inlineLabel
      activeId={provider.id}
      items={PICKER_ITEMS}
      onPick={setProviderId}
      isUpdating={isFetching && !isLoading}
    />
  );

  // An empty or failed catalogue must not leave a bare dropdown with a blank
  // shelf. Keep the picker mounted so the viewer can switch service, and put
  // the recovery in the rail itself.
  const empty = (
    <div className="rail-empty provider-empty" role="status">
      <RefreshCw size={18} aria-hidden="true" />
      <p>
        {isError
          ? t("home.rails.providerError", { name: provider.name })
          : t(mediaType === "tv" ? "home.rails.providerEmptyShows" : "home.rails.providerEmptyMovies", {
              name: provider.name,
            })}
      </p>
      <button type="button" className="provider-empty__retry" onClick={() => refetch()}>
        {t("home.tryAgain")}
      </button>
    </div>
  );

  return (
    <HomeRail
      title={title}
      header={header}
      ariaLabel={title}
      rowIndex={rowIndex}
      movies={movies}
      empty={empty}
      renderItem={(movie, index, detailToken) => (
        <HomeCard
          key={movie.id}
          movie={movie}
          index={index}
          detailToken={detailToken}
        />
      )}
    />
  );
}

export default ProviderRail;
