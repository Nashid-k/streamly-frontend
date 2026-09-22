import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CloudOff, FolderOpen, RotateCcw } from "lucide-react";
import AmbientBackground from "../components/AmbientBackground";
import { useI18n } from "../i18n";
import { useMyCollections } from "../hooks/useUserData";
import { fetchPublicCollections, ExploreError } from "../api/publicCollections";
import { logWarn } from "../utils/debugLogger";

export default function ExploreCollectionsPage() {
  const { t } = useI18n();
  const { publicCollections } = useMyCollections();
  const [remoteCollections, setRemoteCollections] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);
    fetchPublicCollections({ signal: controller.signal })
      .then(setRemoteCollections)
      .catch((error) => {
        if (error?.name === "AbortError") return;
        if (error instanceof ExploreError) {
          setLoadError(error);
          logWarn("publicCollections", "Explore listing failed.", { message: error?.message });
        } else {
          setLoadError(new ExploreError(error?.message || "Unknown error"));
        }
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [retryToken]);

  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  // Merge the viewer's own public collections with every user's public
  // collections from the backend, deduped by publicId (own copy wins — it
  // carries the local itemIds). Anonymous: no owner identity shown anywhere.
  const merged = useMemo(() => {
    const map = new Map();
    for (const c of publicCollections) {
      if (c?.publicId) map.set(c.publicId, c);
    }
    for (const c of remoteCollections) {
      if (c?.publicId && !map.has(c.publicId)) map.set(c.publicId, c);
    }
    return [...map.values()];
  }, [publicCollections, remoteCollections]);

  return (
    <AmbientBackground>
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 md:py-12">
        <header className="mb-8 md:mb-10 text-left">
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight">
            {t("explore.title")}
          </h1>
          <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-2xl">
            {t("explore.subtitle")}
          </p>
        </header>

        {loadError ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 md:p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-red-300">
              <CloudOff size={16} />
              {t("explore.errorTitle")}
            </div>
            <p className="text-sm text-muted-foreground">{t("explore.errorMessage")}</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-white/20"
            >
              <RotateCcw size={14} />
              {t("explore.retry")}
            </button>
          </div>
        ) : isLoading && merged.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[72px] animate-pulse rounded-xl border bg-muted/40"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : merged.length === 0 ? (
          <p className="text-muted-foreground">{t("explore.empty")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {merged.map((collection, index) => (
              <motion.div
                key={collection.publicId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <Link
                  to={`/collections/${collection.publicId}`}
                  className="flex items-center gap-3 rounded-xl border bg-muted/40 p-4 transition-colors hover:bg-muted/70"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <FolderOpen size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {collection.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t("explore.itemCount", {
                        count: Array.isArray(collection.itemIds)
                          ? collection.itemIds.length
                          : collection.itemCount ?? 0,
                      })}
                    </span>
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AmbientBackground>
  );
}
