import { useMemo } from "react";
import { ExternalLink } from "lucide-react";

function getViewerRegion() {
  if (typeof navigator === "undefined" || !navigator.language) return "US";
  const parts = navigator.language.split("-");
  return parts.length > 1 && parts[1].length === 2 ? parts[1].toUpperCase() : "US";
}

function dedupeProviders(list = []) {
  const seen = new Set();
  const deduped = [];
  for (const item of list) {
    if (!item?.provider_id || seen.has(item.provider_id)) continue;
    seen.add(item.provider_id);
    deduped.push({
      id: item.provider_id,
      name: item.provider_name,
      logoUrl: item.logo_path ? `https://image.tmdb.org/t/p/w92${item.logo_path}` : null,
    });
  }
  return deduped;
}

export default function WhereToWatch({ watchProviders, className = "" }) {
  const userRegion = useMemo(() => getViewerRegion(), []);

  const regionalData = useMemo(() => {
    if (!watchProviders || typeof watchProviders !== "object") return null;
    const region = watchProviders[userRegion] || watchProviders.US || Object.values(watchProviders)[0];
    if (!region) return null;

    const stream = dedupeProviders([...(region.flatrate || []), ...(region.free || []), ...(region.ads || [])]);
    const rent = dedupeProviders(region.rent || []);
    const buy = dedupeProviders(region.buy || []);

    if (stream.length === 0 && rent.length === 0 && buy.length === 0) return null;

    return {
      regionKey: watchProviders[userRegion] ? userRegion : (watchProviders.US ? "US" : Object.keys(watchProviders)[0]),
      link: region.link || null,
      groups: [
        { key: "stream", label: "Stream", items: stream },
        { key: "rent", label: "Rent", items: rent },
        { key: "buy", label: "Buy", items: buy },
      ].filter((g) => g.items.length > 0),
    };
  }, [watchProviders, userRegion]);

  if (!regionalData) return null;

  return (
    <section
      className={`where-to-watch relative z-10 max-w-full mx-auto px-2 mt-8 ${className}`}
      aria-label="Where to watch"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl lg:text-2xl font-bold text-white/90 m-0">
            Where to Watch
          </h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/10 text-white/70 tracking-wider">
            {regionalData.regionKey}
          </span>
        </div>

        {regionalData.link && (
          <a
            href={regionalData.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white/50 hover:text-white transition-colors"
          >
            <span>JustWatch via TMDB</span>
            <ExternalLink size={13} strokeWidth={1.5} />
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {regionalData.groups.map((group) => (
          <div
            key={group.key}
            className="rounded-xl border border-white/8 bg-white/[0.03] p-4 flex flex-col gap-3"
          >
            <span className="text-xs font-bold uppercase tracking-wider text-white/50">
              {group.label}
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              {group.items.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/6 hover:border-white/20 transition-colors"
                  title={provider.name}
                >
                  {provider.logoUrl ? (
                    <img
                      src={provider.logoUrl}
                      alt={provider.name}
                      className="w-6 h-6 rounded-md object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                  <span className="text-xs font-medium text-white/90">
                    {provider.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
