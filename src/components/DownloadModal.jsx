import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Server,
  Star,
  X,
} from "lucide-react";
import { downloadService, DownloadUnavailableError, createPauseController } from "../api/downloadService";
import { movieService } from "../api/movieService";
import { useToast } from "./Toast";
import { useDownloads } from "../context/downloads";
import Chip from "./Chip";
import {
  estimateBytes,
  formatBytes,
  resolutionLabel,
  safeFileName,
  variantLabel,
} from "../utils/downloadQuality";
import { logDebug, logWarn } from "../utils/debugLogger";

/* ── DownloadModal — browser-only offline downloads ────────────────────
   Vercel has no storage and the app has no backend, so "download" means
   either:
   1. Opening the HLS stream URL directly (let browser/external tools handle it)
   2. Fetching bytes through our serverless resolver and saving to disk

   External embed hosts block automated scraping, so direct MP4 downloads are
   not feasible. The industry pattern is to offer the stream URL that users
   can open in browser or download with yt-dlp/ffmpeg.

   Layout mirrors Cinejoy's download sheet: a quality filter rail plus one
   row per (source server × quality) with the top-quality badge, a size
   estimate, and a download action.

   Accessibility mirrors the Settings sign-in modal: portal + scroll lock +
   Tab trap + Escape + focus return. */

const getNumericId = (s) => {
  if (!s) return null;
  const m = s.toString().match(/\d+/);
  return m ? m[0] : null;
};

const pad2 = (n) => String(n).padStart(2, "0");

function fileNameBase(movie, { isTv, season, episode, quality }) {
  const title = movie?.title || movie?.name || "download";
  const year = movie?.releaseYear || movie?.year || "";
  const parts = [year ? `${title} (${year})` : title];
  if (isTv) parts.push(`S${pad2(season)}E${pad2(episode)}`);
  if (quality) parts.push(`[${quality}]`);
  return safeFileName(parts.join(" "));
}

function matchVariant(variants, chosen) {
  if (!chosen) return variants[0];
  return (
    variants.find((v) => v.height === chosen.height && v.hdr === chosen.hdr) ||
    variants.find((v) => v.label === chosen.label) ||
    variants[0]
  );
}

const RESOLVE_CONCURRENCY = 3;

export default function DownloadModal({
  movie,
  servers = [],
  isTvContent = false,
  initialSeason = 1,
  initialEpisode = 1,
  onClose,
}) {
  const { toast } = useToast();
  const { registerDownload, updateDownload, cancelDownload, removeDownload } = useDownloads();
  const panelRef = useRef(null);
  const abortRef = useRef(null);
  const resolveAbortRef = useRef(null);
  const imdbIdRef = useRef(null);

  const isTv = Boolean(isTvContent);
  const numericId = useMemo(() => getNumericId(movie?.id), [movie?.id]);
  // Every row is one of the player rotation's servers. The server's index in
  // this list is a row's serverIndex, so URLs resolve in one place.
  const allSources = useMemo(() => servers, [servers]);
  const [imdbId, setImdbId] = useState(
    movie?.imdbId || movie?.imdb_id || movie?.external_ids?.imdb_id || null,
  );

  const [selectedSeason, setSelectedSeason] = useState(initialSeason || 1);
  const [selectedEpisodes, setSelectedEpisodes] = useState(
    () => new Set([initialEpisode || 1]),
  );
  const [qualityFilter, setQualityFilter] = useState("all");

  const [rows, setRows] = useState([]);
  const [resolveState, setResolveState] = useState({
    status: "idle",
    error: null,
    done: 0,
    total: 0,
    failed: 0,
  });
  const [downloadState, setDownloadState] = useState({
    status: "idle",
    rowKey: null,
    episodeIndex: 0,
    total: 0,
    episode: null,
    progress: null,
    error: null,
  });

  /* Lazily resolve the IMDb id — Servers 2/3/5/6/7 key off it. Kept in a ref
     so the discovery doesn't re-trigger the ladder resolution below. */
  useEffect(() => {
    imdbIdRef.current = imdbId;
  }, [imdbId]);

  useEffect(() => {
    if (imdbId || !movie?.id) return;
    let cancelled = false;
    movieService
      .getExternalIds(movie.id)
      .then((external) => {
        if (!cancelled && external?.imdb_id) setImdbId(external.imdb_id);
      })
      .catch((error) => {
        logWarn("download", "Could not resolve IMDb id — falling back to TMDB id.", {
          message: error?.message,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [imdbId, movie?.id]);

  const { data: episodesData, isLoading: episodesLoading } = useQuery({
    queryKey: ["downloadEpisodes", movie?.id, selectedSeason],
    queryFn: () => movieService.getSeasonEpisodes(movie.id, selectedSeason),
    enabled: isTv && Boolean(movie?.id),
    staleTime: 1000 * 60 * 10,
    retry: 2,
  });
  const episodes = episodesData?.episodes || [];

  const buildEmbedUrl = useCallback(
    (server, seasonOverride, episodeOverride) => {
      if (!server?.url) return "";
      return server.url(
        numericId,
        isTv ? (seasonOverride ?? selectedSeason) : null,
        isTv ? (episodeOverride ?? initialEpisode) : null,
        imdbIdRef.current,
        movie?.title,
      );
    },
    [numericId, isTv, selectedSeason, initialEpisode, movie?.title],
  );

  /* Resolve every server so the sheet can list all sources, capped at a few
     concurrent requests so we don't hammer the serverless resolver. Rows are
     appended as each server answers, matching the streaming-style "scanning"
     feel. */
  const resolveAll = useCallback(
    async (signal) => {
      setRows([]);
      setQualityFilter("all");
      if (!numericId) {
        setResolveState({ status: "error", error: "This title has no streamable ID.", done: 0, total: 0, failed: 0 });
        return;
      }
      setResolveState({ status: "resolving", error: null, done: 0, total: allSources.length, failed: 0 });
      const targetEpisode = isTv ? initialEpisode : null;
      const queue = allSources.map((_, index) => index);
      let done = 0;
      let failed = 0;
      let resolved = 0;

      const worker = async () => {
        while (queue.length > 0) {
          if (signal?.aborted) return;
          const index = queue.shift();
          const embedUrl = buildEmbedUrl(allSources[index], selectedSeason, targetEpisode);
          try {
            const { source, variants } = await downloadService.resolveDownload(embedUrl, { signal });
            if (signal?.aborted) return;
            resolved += 1;
            const nextRows = variants.map((variant) => ({
              key: `${index}:${variant.uri}`,
              serverIndex: index,
              serverName: allSources[index]?.name || `Server ${index + 1}`,
              variant,
              label: variantLabel(variant),
              group: resolutionLabel(variant.width, variant.height),
              source,
            }));
            setRows((prev) => [...prev, ...nextRows]);
            logDebug("download", `Source "${allSources[index]?.name}" offers ${variants.length} quality variant(s).`, {
              qualities: variants.map((v) => v.label),
            });
          } catch (error) {
            if (error?.name === "AbortError") return;
            failed += 1;
            logWarn("download", `Source "${allSources[index]?.name}" has no downloadable stream.`, {
              message: error?.message,
              code: error?.code,
            });
            if (error instanceof DownloadUnavailableError && error.code === "offline") {
              setResolveState({ status: "error", error: error.message, done, total: allSources.length, failed });
              return;
            }
          } finally {
            done += 1;
            setResolveState((prev) =>
              prev.status === "resolving" ? { ...prev, done, failed } : prev,
            );
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(RESOLVE_CONCURRENCY, allSources.length) }, worker),
      );
      if (signal?.aborted) return;
      setResolveState((prev) => {
        if (prev.status === "error") return prev;
        if (resolved === 0) {
          return {
            status: "error",
            error: "None of the servers offered a downloadable file for this title.",
            done,
            total: allSources.length,
            failed,
          };
        }
        return { status: "ready", error: null, done, total: allSources.length, failed };
      });
    },
    [allSources, buildEmbedUrl, numericId, isTv, selectedSeason, initialEpisode],
  );

  /* Resolve on open (and when the season changes). */
  useEffect(() => {
    const controller = new AbortController();
    resolveAbortRef.current = controller;
    resolveAll(controller.signal);
    return () => controller.abort();
  }, [resolveAll]);

  /* Scroll lock + focus management (see SettingsPage sign-in modal). */
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevActive = document.activeElement;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      [...(panelRef.current?.querySelectorAll("button, [href], input, select, [tabindex]:not([tabindex='-1'])") || [])]
        .filter((el) => !el.disabled && !el.hidden);
    (focusables()[0] || panelRef.current)?.focus?.({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") {
        // Never abort a running download when the sheet closes — the session
        // store keeps pulling bytes and the /downloads page owns it from here.
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!panelRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      prevActive?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const durationSeconds = isTv
    ? (episodes.find((ep) => ep.episodeNumber === [...selectedEpisodes][0])?.durationMins || 45) * 60
    : (movie?.durationMins || 120) * 60;
  const episodeCount = isTv ? Math.max(1, selectedEpisodes.size) : 1;
  const fileTitle = movie?.title || movie?.name || "File";

  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          (b.variant.height || 0) - (a.variant.height || 0) ||
          (b.variant.bandwidth || 0) - (a.variant.bandwidth || 0) ||
          a.serverIndex - b.serverIndex,
      ),
    [rows],
  );

  const qualityGroups = useMemo(() => {
    const seen = new Map();
    for (const row of sortedRows) {
      if (!seen.has(row.group)) seen.set(row.group, row.variant.height || 0);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([group]) => group);
  }, [sortedRows]);

  const visibleRows = useMemo(
    () => (qualityFilter === "all" ? sortedRows : sortedRows.filter((row) => row.group === qualityFilter)),
    [sortedRows, qualityFilter],
  );

  const topKey = sortedRows[0]?.key || null;

  const sizeLabelFor = (variant) => {
    if (variant?.direct) return "direct file";
    const size = estimateBytes(variant?.bandwidth, durationSeconds * episodeCount);
    return size ? `~${formatBytes(size)}` : variant?.bandwidth ? `${Math.round(variant.bandwidth / 1e6)} Mbps` : "";
  };

  const toggleEpisode = (num) => {
    setSelectedEpisodes((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  /* The actual download engine. Runs a server/quality across every selected
     episode, streaming progress into the session store. Deliberately
     independent of the modal's own lifecycle so a download keeps running in
     the background after the sheet closes, and retries from the /downloads
     page work without the modal (the in-memory `retry` closure re-runs
     this). */
  const runDownload = useCallback(
    async (row) => {
      if (!row) return;
      const server = allSources[row.serverIndex];
      const targets = isTv ? [...selectedEpisodes].sort((a, b) => a - b) : [null];
      if (isTv && targets.length === 0) return;

      // Single-file downloads get the native Save-As picker, opened
      // synchronously so the browser keeps the user activation.
      let writable = null;
      if (targets.length === 1) {
        try {
          writable = await downloadService.pickSaveTarget(
            `${fileNameBase(movie, {
              isTv,
              season: selectedSeason,
              episode: targets[0],
              quality: row.variant.label,
            })}.mp4`,
          );
        } catch (error) {
          if (error?.name === "AbortError") return;
          logWarn("[download] File save picker failed - using Blob fallback", { error: error?.message });
          writable = null;
        }
      }

      const controller = new AbortController();
      const gate = createPauseController();
      abortRef.current = controller;
      const storeTitle = movie?.title || movie?.name || "File";
      const downloadId = registerDownload({
        title: storeTitle,
        year: movie?.releaseYear || movie?.year || "",
        posterUrl: movie?.posterUrl || movie?.backdropUrl || null,
        backdropUrl: movie?.backdropUrl || null,
        isTv,
        quality: row.label || variantLabel(row.variant),
        serverName: row.serverName,
        episodeCount: targets.length,
        status: "downloading",
        progress: null,
        error: null,
        abort: () => controller.abort(),
      });

      // The /downloads page drives these through the store record. Each is a
      // stable closure over this run's own ids/controllers, so Pause/Resume/
      // Retry keep working long after the modal closed.
      updateDownload(downloadId, {
        pause: () => {
          gate.pause();
          updateDownload(downloadId, { status: "paused" });
        },
        resume: () => {
          gate.resume();
          updateDownload(downloadId, { status: "downloading" });
        },
        retry: () => {
          removeDownload(downloadId);
          runDownload(row);
        },
      });

      setDownloadState({
        status: "downloading",
        rowKey: row.key,
        episodeIndex: 0,
        total: targets.length,
        episode: targets[0] || null,
        progress: null,
        error: null,
      });

      try {
        for (let i = 0; i < targets.length; i += 1) {
          const episode = targets[i];
          setDownloadState((prev) => ({ ...prev, episodeIndex: i, episode, progress: null }));
          updateDownload(downloadId, { episodeIndex: i });
          const embedUrl = buildEmbedUrl(server, selectedSeason, episode);
          const { source, variants: fresh } = await downloadService.resolveDownload(embedUrl, { signal: controller.signal });
          const variant = matchVariant(fresh, row.variant);
          if (!variant) throw new DownloadUnavailableError("That quality is no longer offered by the server.", "no-source");
          const manifest = await downloadService.buildManifest(source, variant, { signal: controller.signal });
          const totalBytes = manifest?.duration
            ? estimateBytes(variant.bandwidth, manifest.duration)
            : estimateBytes(variant.bandwidth, durationSeconds);
          await downloadService.saveStream({
            manifest,
            source,
            baseName: fileNameBase(movie, { isTv, season: selectedSeason, episode, quality: variant.label }),
            writable: i === 0 ? writable : null,
            signal: controller.signal,
            pause: gate,
            onProgress: (progress) => {
              // saveStream reports a true network-arrival rate (windowed); the
              // old EMA here measured delta between _write_ bursts and showed
              // unrealistic disk speed. Fall back to 0 when no rate is given.
              updateDownload(downloadId, {
                progress: { ...progress, speed: progress.speed || 0, totalBytes },
                episodeIndex: i,
              });
              setDownloadState((prevState) => ({
                ...prevState,
                progress: { ...progress, speed: progress.speed || 0, totalBytes },
              }));
            },
          });
        }
        setDownloadState((prev) => ({ ...prev, status: "done", progress: null }));
        updateDownload(downloadId, { status: "done", progress: null });
        toast({
          title: "Download complete",
          message: targets.length > 1
            ? `${targets.length} episodes saved.`
            : `"${movie?.title || "File"}" saved to your device.`,
          type: "success",
          duration: 3500,
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          cancelDownload(downloadId);
          setDownloadState({ status: "idle", rowKey: null, episodeIndex: 0, total: 0, episode: null, progress: null, error: null });
        } else {
          updateDownload(downloadId, { status: "error", error: error?.message || "Download failed." });
          setDownloadState((prev) => ({ ...prev, status: "error", error: error?.message || "Download failed." }));
        }
      } finally {
        abortRef.current = null;
      }
    },
    [allSources, isTv, selectedEpisodes, selectedSeason, movie, buildEmbedUrl, durationSeconds,
      registerDownload, updateDownload, cancelDownload, removeDownload, toast],
  );

  const handleDownload = async (row) => {
    if (!row || downloadState.status === "downloading" || allSources.length === 0) return;
    await runDownload(row);
  };

  const isDownloading = downloadState.status === "downloading";
  // A row is downloadable as soon as ITS server resolved — rows stream in while
  // slower sources are still being scanned. Gating the whole sheet on "ready"
  // made the first click land on a disabled button.
  const canPickSource = !isDownloading && sortedRows.length > 0;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="download-backdrop"
        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            onClose?.();
          }
        }}
      >
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="download-modal-title"
          tabIndex={-1}
          className="download-panel w-[min(100%,36rem)] max-h-[min(88dvh,52rem)] flex flex-col overflow-hidden rounded-2xl sm:rounded-3xl outline-none"
        >
          <header className="shrink-0 px-5 sm:px-7 pt-5 sm:pt-7 pb-5 border-b border-white/[0.08]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50 mb-2">
                  Offline download
                </span>
                <h3 id="download-modal-title" className="truncate text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Download
                </h3>
                <p className="mt-1.5 truncate text-sm text-white/60">{movie?.title || movie?.name || "Movie"}</p>
                {isTv && (
                  <p className="mt-1 text-xs text-white/40">
                    Season {selectedSeason} · {selectedEpisodes.size} episode{selectedEpisodes.size === 1 ? "" : "s"} selected
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                }}
                aria-label="Close download"
                className="shrink-0 rounded-full p-2 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          <div className="download-panel-scroll px-4 sm:px-7 py-5 sm:py-6 space-y-5 sm:space-y-6 overflow-y-auto">
            {/* Series: season + episodes */}
            {isTv && resolveState.status !== "error" && (
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/45 mb-2">
                  Episodes
                </div>
                <div className="relative mb-2">
                  <select
                    value={selectedSeason}
                    onChange={(e) => {
                      setSelectedSeason(Number(e.target.value));
                      setSelectedEpisodes(new Set([1]));
                    }}
                    className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                    aria-label="Season"
                  >
                    {Array.from({ length: Math.max(1, Number(movie?.seasonsCount) || 1) }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n} className="bg-[#141414]">
                        Season {n}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-white/[0.07] divide-y divide-white/[0.05]">
                  {episodesLoading && (
                    <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/50">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading episodes…
                    </div>
                  )}
                  {!episodesLoading && episodes.length === 0 && (
                    <div className="px-4 py-3 text-sm text-white/40">No episodes found for this season.</div>
                  )}
                  {episodes.map((ep) => {
                    const checked = selectedEpisodes.has(ep.episodeNumber);
                    return (
                      <button
                        type="button"
                        key={ep.id || ep.episodeNumber}
                        onClick={() => toggleEpisode(ep.episodeNumber)}
                        className="w-full flex items-center gap-3 px-3.5 sm:px-4 py-2.5 text-left text-sm hover:bg-white/[0.04] transition-colors"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked ? "bg-[var(--accent-primary)] border-transparent" : "border-white/25"
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
                        </span>
                        <span className="text-white/80 truncate">
                          E{pad2(ep.episodeNumber)} · {ep.title || `Episode ${ep.episodeNumber}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Source header + resolution progress */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/45">
                <Server className="w-3.5 h-3.5" />
                Sources
              </div>
              <div className="flex items-center gap-2">
                {resolveState.status === "resolving" && (
                  <span className="flex items-center gap-1.5 text-[11px] text-white/40">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {resolveState.done}/{resolveState.total} scanned
                  </span>
                )}
              </div>
            </div>

            {/* Quality filter rail */}
            {qualityGroups.length > 1 && (
              <div className="flex flex-wrap gap-2 sm:gap-2.5" role="group" aria-label="Filter by quality">
                <Chip size="sm" active={qualityFilter === "all"} onClick={() => setQualityFilter("all")}>
                  All
                </Chip>
                {qualityGroups.map((group) => (
                  <Chip
                    key={group}
                    size="sm"
                    active={qualityFilter === group}
                    onClick={() => setQualityFilter(group)}
                  >
                    {group}
                  </Chip>
                ))}
              </div>
            )}

            {/* Skeleton while the first servers answer */}
            {resolveState.status === "resolving" && sortedRows.length === 0 && (
              <div className="space-y-2.5 sm:space-y-3" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-xl border border-white/[0.06] bg-white/[0.03] animate-pulse"
                  />
                ))}
              </div>
            )}

            {/* Error */}
            {resolveState.status === "error" && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3.5 text-sm text-amber-200/90">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p>{resolveState.error}</p>
                  <button
                    type="button"
                    onClick={() => {
                      const controller = new AbortController();
                      resolveAbortRef.current = controller;
                      resolveAll(controller.signal);
                    }}
                    className="mt-2 text-xs font-semibold underline underline-offset-2 hover:text-white"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            {/* Source rows */}
            {sortedRows.length > 0 && (
              <div className="space-y-2.5 sm:space-y-3" role="list" aria-label="Available downloads">
                {visibleRows.map((row) => {
                  const isTop = row.key === topKey;
                  const isActive = downloadState.rowKey === row.key && isDownloading;
                  return (
                    <div
                      key={row.key}
                      role="listitem"
                      className={`flex flex-wrap items-center gap-x-3 gap-y-2.5 sm:gap-x-4 sm:flex-nowrap rounded-xl border px-3.5 sm:px-4 py-3 sm:py-3.5 transition-colors ${
                        isActive
                          ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                          : "border-white/[0.07] bg-white/[0.03]"
                      }`}
                    >
                      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                        <div className="flex items-center gap-2.5 min-w-0 flex-wrap sm:flex-nowrap">
                          <span className="truncate text-sm font-semibold text-white">{fileTitle}</span>
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-white/10 text-white/80">
                            {row.label}
                          </span>
                          {isTop && (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-black" style={{ background: "var(--accent-gradient)" }}>
                              <Star className="w-3 h-3" fill="currentColor" /> BEST
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-[11px] text-white/40">
                          {row.serverName} · {sizeLabelFor(row.variant)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownload(row)}
                        disabled={!canPickSource || (isTv && selectedEpisodes.size === 0)}
                        aria-label={`Download ${row.label} of ${fileTitle} from ${row.serverName}`}
                        className="shrink-0 inline-flex items-center gap-1.5 ml-auto sm:ml-0 rounded-lg px-3.5 sm:px-4 py-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-transform active:scale-[0.98]"
                        style={{ background: "var(--accent-gradient)", color: "var(--on-accent, #fff)" }}
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {isTv && selectedEpisodes.size > 1 ? `Download ${selectedEpisodes.size} episodes` : "Download"}
                        </span>
                      </button>
                    </div>
                  );
                })}
                {visibleRows.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-white/40">
                    No sources match that quality.
                  </div>
                )}
              </div>
            )}

            {/* Progress */}
            {isDownloading && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 sm:px-4 py-3.5 sm:py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-white/60 mb-2 sm:mb-2.5">
                  <span className="truncate">
                    {downloadState.total > 1
                      ? `Episode ${downloadState.episodeIndex + 1} of ${downloadState.total}`
                      : "Downloading…"}
                  </span>
                  <span className="flex items-center gap-3">
                    {downloadState.progress?.speed > 0 && (
                      <span className="text-white/40">{formatBytes(downloadState.progress.speed)}/s</span>
                    )}
                    <span>{downloadState.progress ? `${Math.round(downloadState.progress.ratio * 100)}%` : ""}</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full transition-all duration-300 rounded-full"
                    style={{
                      width: `${Math.round((downloadState.progress?.ratio || 0) * 100)}%`,
                      background: "var(--accent-gradient)",
                    }}
                  />
                </div>
                {downloadState.progress?.bytesLabel && (
                  <p className="mt-2 text-[11px] text-white/40">
                    {downloadState.progress.bytesLabel}
                    {downloadState.progress.totalBytes > 0
                      ? ` / ${formatBytes(downloadState.progress.totalBytes)}`
                      : ""}
                    {" downloaded"}
                  </p>
                )}
              </div>
            )}

            {downloadState.status === "error" && (
              <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3.5 text-sm text-red-200/90">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{downloadState.error}</p>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 flex flex-col-reverse sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 sm:px-7 py-4 border-t border-white/[0.08]">
            <p className="flex-1 text-[11px] leading-relaxed text-white/35">
              Available qualities, resolution and HDR are whatever the source server actually
              provides — protected (DRM) streams can’t be downloaded. Please only download content
              you’re allowed to keep.
            </p>
            {isDownloading ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="w-full sm:w-auto shrink-0 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto shrink-0 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/[0.06] transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
