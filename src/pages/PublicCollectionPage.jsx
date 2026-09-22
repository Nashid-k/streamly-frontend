import React, { useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CloudOff, FolderOpen, RotateCcw } from "lucide-react";
import AmbientBackground from "../components/AmbientBackground";
import MovieCard from "../components/MovieCard";
import SEO from "../components/SEO";
import { useI18n } from "../i18n";
import { useMyCollections } from "../hooks/useUserData";
import { useAppAuth } from "../context/auth";
import { fetchPublicCollection } from "../api/publicCollections";
import { movieService } from "../api/movieService";

// Hard cap matching the server-side itemIds limit (api/sync.js). A hostile or
// bloated payload can no longer explode into an unbounded TMDB request storm.
const MAX_ITEMS = 300;

// Fetched with bounded concurrency and stored in the shared React Query
// cache — the old raw Promise.all hit TMDB once per item on EVERY visit and
// bypassed the cache entirely.
async function fetchCollectionItems(itemIds) {
  const ids = [...new Set(itemIds)].slice(0, MAX_ITEMS);
  const results = [];
  const CONCURRENCY = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        results.push({ id, item: await movieService.getMovieDetails(id) });
      } catch {
        results.push({ id, item: null });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return results.filter((r) => r.item).map((r) => r.item);
}

export default function PublicCollectionPage() {
  const { publicId } = useParams();
  const { t } = useI18n();
  const { getPublicCollection } = useMyCollections();
  const { myList } = useAppAuth();

  // Local public collection (the viewer's own device).
  const local = useMemo(() => getPublicCollection(publicId), [getPublicCollection, publicId]);

  // Remote public collection (any user's public list, fetched by publicId).
  // React Query owns loading/error/retry states — no more blank-page null
  // while the lookup was in flight.
  const remoteQuery = useQuery({
    queryKey: ["public-collection", publicId],
    queryFn: ({ signal }) => fetchPublicCollection(publicId, { signal }),
    enabled: Boolean(publicId) && !local,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const remoteCollection = remoteQuery.data || null;
  const remoteError = remoteQuery.error;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [publicId]);

  const collection = local || remoteCollection;

  // Page title + share metadata for the shared link (old page never set one).
  const seoTitle = collection?.name
    ? `${collection.name} — ${t("explore.title")}`
    : t("explore.title");
  const seoDescription = collection
    ? t("explore.itemCount", {
        count: Array.isArray(collection.itemIds) ? collection.itemIds.length : 0,
      })
    : t("explore.subtitle");

  // Remote items query — declared before the items memo below (hooks must
  // not be conditional; enabled gates the actual fetching).
  const remoteItemsQuery = useQuery({
    queryKey: ["public-collection-items", publicId, collection?.publicId],
    queryFn: () => fetchCollectionItems(collection?.itemIds || []),
    enabled: Boolean(!local && collection && Array.isArray(collection.itemIds)),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  // Resolve the collection's items:
  //   • own local collection → match against the viewer's saved myList
  //   • remote collection    → items fetched (cached) from TMDB above
  const items = useMemo(() => {
    if (!collection) return [];
    const ids = new Set(collection.itemIds || []);
    if (local) {
      return myList.filter((m) => ids.has(m.id));
    }
    return remoteItemsQuery.data || [];
  }, [collection, local, myList, remoteItemsQuery.data]);

  if (remoteError && !collection) {
    return (
      <AmbientBackground>
        <SEO title={seoTitle} description={seoDescription} />
        <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 md:py-12">
          <Link
            to="/explore/collections"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} />
            {t("explore.title")}
          </Link>
          <div className="mt-6 flex flex-col items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 md:p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-red-300">
              <CloudOff size={16} />
              {t("explore.errorTitle")}
            </div>
            <p className="text-sm text-muted-foreground">{t("explore.errorMessage")}</p>
            <button
              type="button"
              onClick={() => remoteQuery.refetch()}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-white/20"
            >
              <RotateCcw size={14} />
              {t("explore.retry")}
            </button>
          </div>
        </div>
      </AmbientBackground>
    );
  }

  if (!collection) {
    // Remote lookup still in flight — show a skeleton, never a blank null.
    return (
      <AmbientBackground>
        <SEO title={seoTitle} description={seoDescription} />
        <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 md:py-12" aria-busy="true">
          <Link
            to="/explore/collections"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} />
            {t("explore.title")}
          </Link>
          <div className="mt-6 h-10 w-64 animate-pulse rounded-lg bg-white/5" aria-hidden="true" />
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-white/5" aria-hidden="true" />
            ))}
          </div>
        </div>
      </AmbientBackground>
    );
  }

  const itemCount = Array.isArray(collection.itemIds) ? collection.itemIds.length : 0;
  const itemsMissing = !local && itemCount > 0 && items.length < itemCount;

  return (
    <AmbientBackground>
      <SEO title={seoTitle} description={seoDescription} />
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 md:py-12">
        <Link
          to="/explore/collections"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          {t("explore.title")}
        </Link>

        <header className="mt-4 mb-6 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary">
            <FolderOpen size={20} />
          </span>
          <div>
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight">
              {collection.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("explore.itemCount", { count: itemCount })}
            </p>
            {itemsMissing && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("explore.someItemsUnavailable")}
              </p>
            )}
          </div>
        </header>

        {items.length === 0 ? (
          remoteItemsQuery.isFetching && !local ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-white/5" aria-hidden="true" />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">{t("explore.empty")}</p>
          )
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
            {items.map((movie, index) => (
              <motion.div
                key={movie.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.3) }}
              >
                <MovieCard movie={movie} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AmbientBackground>
  );
}
