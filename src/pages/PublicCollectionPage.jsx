import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, FolderOpen } from "lucide-react";
import AmbientBackground from "../components/AmbientBackground";
import MovieCard from "../components/MovieCard";
import { useI18n } from "../i18n";
import { useMyCollections } from "../hooks/useUserData";
import { useAppAuth } from "../context/auth";
import { fetchPublicCollection } from "../api/publicCollections";
import { movieService } from "../api/movieService";
import { logDebug } from "../utils/debugLogger";

export default function PublicCollectionPage() {
  const { publicId } = useParams();
  const { t } = useI18n();
  const { getPublicCollection } = useMyCollections();
  const { myList } = useAppAuth();

  // Local public collection (the viewer's own device).
  const local = useMemo(() => getPublicCollection(publicId), [getPublicCollection, publicId]);
  // Remote public collection (any user's public list, fetched by publicId).
  const [remoteCollection, setRemoteCollection] = useState(null);
  const [remoteLoading, setRemoteLoading] = useState(Boolean(publicId));

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [publicId]);

  useEffect(() => {
    if (!publicId) return;
    if (local) {
      setRemoteCollection(null);
      setRemoteLoading(false);
      return;
    }
    const controller = new AbortController();
    setRemoteLoading(true);
    fetchPublicCollection(publicId, { signal: controller.signal })
      .then((collection) => {
        setRemoteCollection(collection);
        if (collection) logDebug('publicCollections', `Resolved remote public collection ${collection.name}.`, { publicId });
      })
      .finally(() => setRemoteLoading(false));
    return () => controller.abort();
  }, [publicId, local]);

  const collection = local || remoteCollection;

  const [remoteItems, setRemoteItems] = useState([]);
  useEffect(() => {
    if (local || !remoteCollection) {
      setRemoteItems([]);
      return;
    }
    let cancelled = false;
    const idsList = [...new Set(remoteCollection.itemIds || [])];
    Promise.all(
      idsList.map((id) =>
        movieService.getMovieDetails(id).catch(() => null)
      ),
    ).then((resolved) => {
      if (!cancelled) setRemoteItems(resolved.filter(Boolean));
    });
    return () => {
      cancelled = true;
    };
  }, [local, remoteCollection]);

  // Resolve the collection's items:
  //   • own local collection → match against the viewer's saved myList
  //   • remote collection    → items fetched by id from TMDB above
  const items = useMemo(() => {
    if (!collection) return [];
    const ids = new Set(collection.itemIds || []);
    if (local) {
      return myList.filter((m) => ids.has(m.id));
    }
    return remoteItems;
  }, [collection, local, myList, remoteItems]);

  if (!collection && !remoteLoading) {
    return (
      <AmbientBackground>
        <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 md:py-12">
          <Link
            to="/explore/collections"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} />
            {t("explore.title")}
          </Link>
          <p className="mt-6 text-muted-foreground">
            {t("explore.empty")}
          </p>
        </div>
      </AmbientBackground>
    );
  }

  if (!collection) {
    return null; // remote lookup still in flight
  }

  const itemCount = Array.isArray(collection.itemIds)
    ? collection.itemIds.length
    : 0;

  return (
    <AmbientBackground>
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
          </div>
        </header>

        {items.length === 0 ? (
          <p className="text-muted-foreground">{t("explore.empty")}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
            {items.map((movie, index) => (
              <motion.div
                key={movie.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
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