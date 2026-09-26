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
import { useOptionalPreferences } from "../context/preferences";
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
   Vercel has no storage and the app has no backend, so "download" means either
   opening the HLS stream URL directly (the browser or external tools handle it)
   or fetching bytes through the serverless resolver and saving to disk. Direct
   MP4 downloads are not feasible: external embed hosts block automated scraping.

   Layout: a quality filter rail plus one row per quality each source offers,
   with a top-quality badge, a size estimate and a download action. Accessibility
   mirrors the Settings sign-in modal (portal + scroll lock + Tab trap + Escape +
   focus return). */

const getNumericId = (s) => {
  if (!s) return null;
  const m = s.toString().match(/\d+/);
  return m ? m[0] : null;
};

// The sources the sheet fans out over; every row is a quality one of these
// serves. VidSrc (Alt) scrapes server-side (action "resolvevidsrc") and VidCore
// (Server 5) likewise (action "resolvevidcore") — both list direct HLS ladders
// incl. 4K. A third source (CineSrc) was removed with its Chrome mint service:
// its tokens can only be minted in a real browser.
// `sourceKey` is how the engine re-resolves the title's tokens.
const VIDSRC_SOURCE_NAME = "VidSrc (Alt)";
const VIDCORE_SOURCE_NAME = "VidCore (Server 5)";

const RESOLVE_SOURCES = [
  {
    key: "vidsrc",
    name: VIDSRC_SOURCE_NAME,
    serverIndex: 0,
    resolve: (args, opts) => downloadService.resolveVidsrc(args, opts),
  },
  {
    key: "vidcore",
    name: VIDCORE_SOURCE_NAME,
    serverIndex: 4, // Server 5 in the player rotation (videoSourceAdapter).
    resolve: (args, opts) => downloadService.resolveVidcore(args, opts),
  },
];

function resolveArgs(sourceType, numericId, isTv, season, episode) {
  return {
    type: sourceType,
    id: numericId,
    season: isTv ? season : undefined,
    episode: isTv ? episode : undefined,
  };
}

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

export default function DownloadModal({
  movie,
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

  const isTv = Boolean(isTvContent);
  const sourceType = isTv ? "tv" : "movie";
  const numericId = useMemo(() => getNumericId(movie?.id), [movie?.id]);

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

  const { data: episodesData, isLoading: episodesLoading } = useQuery({
    queryKey: ["downloadEpisodes", movie?.id, selectedSeason],
    queryFn: () => movieService.getSeasonEpisodes(movie.id, selectedSeason),
    enabled: isTv && Boolean(movie?.id),
    staleTime: 1000 * 60 * 10,
    retry: 2,
  });
  const episodes = episodesData?.episodes || [];

    /* Resolve every source in parallel so the sheet can list what each actually
       serves: one slow source never blocks another's rows, each failure is honest
       about ITS source, and the error row appears only when EVERY source is empty. */
  const resolveAll = useCallback(
    async (signal) => {
      setRows([]);
      setQualityFilter("all");
      if (!numericId) {
        setResolveState({ status: "error", error: "This title has no streamable ID.", done: 0, total: 0, failed: 0 });
        return;
      }
      const total = RESOLVE_SOURCES.length;
      setResolveState({ status: "resolving", error: null, done: 0, total, failed: 0 });

      let done = 0;
      let failed = 0;
      let offlineError = null;
      let accRows = [];

      const settle = () => {
        if (signal?.aborted) return;
        const finished = done === total;
        let error = null;
        if (finished && accRows.length === 0) {
                    // Every source failed: offline (whole service down) wins the copy so the
                    // user sees the actionable message; otherwise name each empty source.
          error =
            offlineError?.message ||
            RESOLVE_SOURCES.map((s) => `${s.name} did not offer a downloadable version of this title.`).join(" ");
        }
        setResolveState({
          status: finished ? (accRows.length > 0 ? "ready" : "error") : "resolving",
          error,
          done,
          total,
          failed,
        });
      };

      await Promise.all(
        RESOLVE_SOURCES.map(async (def) => {
          try {
            const { source, variants } = await def.resolve(
              resolveArgs(sourceType, numericId, isTv, selectedSeason, initialEpisode),
              { signal },
            );
            if (signal?.aborted) return;
            const nextRows = variants.map((variant) => ({
              key: `${def.key}:${variant.uri}`,
              sourceKey: def.key,
              serverIndex: def.serverIndex,
              serverName: def.name,
              variant,
              label: variantLabel(variant),
              group: resolutionLabel(variant.width, variant.height),
              source,
            }));
            if (nextRows.length > 0) {
              accRows = [...accRows, ...nextRows];
              setRows(accRows);
              logDebug("download", `${def.name} offers ${nextRows.length} quality variant(s).`, {
                qualities: nextRows.map((v) => v.label),
              });
            } else {
              failed += 1;
            }
          } catch (error) {
            if (error?.name === "AbortError" || signal?.aborted) return;
            failed += 1;
            if (error instanceof DownloadUnavailableError && error.code === "offline") {
              offlineError = error;
            }
            logWarn("download", `${def.name} has no downloadable stream.`, {
              message: error?.message,
              code: error?.code,
            });
          } finally {
            done += 1;
            settle();
          }
        }),
      );
    },
    [numericId, sourceType, isTv, selectedSeason, initialEpisode],
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
    return size ? `~${formatBytes(size)}` : "";
  };

  const toggleEpisode = (num) => {
    setSelectedEpisodes((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

    /* "Save to browser Downloads" (Ctrl+J): skip the File System Access picker and
       let saveStream buffer the file for the browser's own download manager.
       Persisted; tests render without the PreferencesProvider, so it is optional. */
  const preferences = useOptionalPreferences();
  const [browserSave] = useState(() => preferences?.browserDownloads ?? false);

    /* The download engine. Runs a server/quality across every selected episode,
       streaming progress into the session store. Deliberately independent of the
       modal's lifecycle so a download survives the sheet closing, and retries from
       /downloads re-run it through the in-memory `retry` closure. */
  const runDownload = useCallback(
    async (row) => {
      if (!row) return;
      const targets = isTv ? [...selectedEpisodes].sort((a, b) => a - b) : [null];
      if (isTv && targets.length === 0) return;

            // Single-file downloads open the native Save-As picker synchronously so the
            // browser keeps the user activation; browser mode skips it so the file lands
            // in the browser's own Downloads list.
      let writable = null;
      if (targets.length === 1 && !browserSave) {
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

            // The /downloads page drives these through the store record; each is a
            // stable closure over this run's ids/controllers, so they keep working.
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
                    // Resolve the episode's tokens through the same resolver the row came
                    // from, then expand the chosen variant into concrete segments.
          const resolveEpisode = async () => {
            const resolverName =
              row.sourceKey === "vidcore" ? "resolveVidcore" : "resolveVidsrc";
            const resolved = await downloadService[resolverName](
              resolveArgs(sourceType, numericId, isTv, selectedSeason, episode),
              { signal: controller.signal },
            );
            const variant = matchVariant(resolved.variants, row.variant);
            if (!variant) throw new DownloadUnavailableError("That quality is no longer offered by the server.", "no-source");
            return {
              source: resolved.source,
              variant,
              manifest: await downloadService.buildManifest(resolved.source, variant, {
                signal: controller.signal,
              }),
            };
          };
          const { source, variant, manifest } = await resolveEpisode();
          const totalBytes = manifest?.duration
            ? estimateBytes(variant.bandwidth, manifest.duration)
            : estimateBytes(variant.bandwidth, durationSeconds);
          await downloadService.saveStream({
            manifest,
            source,
            baseName: fileNameBase(movie, { isTv, season: selectedSeason, episode, quality: variant.label }),
            writable: i === 0 ? writable : null,
            mode: browserSave ? "browser" : undefined,
            signal: controller.signal,
            pause: gate,
            totalBytes,
            onProgress: (progress) => {
                            // saveStream reports a true windowed network-arrival rate; an EMA over
                            // _write_ deltas reads as unrealistic disk speed. Default 0.
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
    [isTv, selectedEpisodes, selectedSeason, movie, sourceType, numericId, durationSeconds,
      registerDownload, updateDownload, cancelDownload, removeDownload, toast, browserSave],
  );

  const handleDownload = async (row) => {
    if (!row || downloadState.status === "downloading") return;
    await runDownload(row);
  };

  const isDownloading = downloadState.status === "downloading";
    // A row is downloadable as soon as ITS source answered — the sheet never blocks
    // on a slower source, so the first click always lands on a live button.
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
          {/* Header */}
          <header className="shrink-0 px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-white/[0.08]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45 mb-1.5">
                  Offline download
                </span>
                <h3 id="download-modal-title" className="truncate text-xl sm:text-2xl font-bold tracking-tight text-white">
                  {movie?.title || movie?.name || "Movie"}
                </h3>
                {isTv && (
                  <p className="mt-1 text-xs text-white/45">
                    Season {selectedSeason} · {selectedEpisodes.size} episode{selectedEpisodes.size === 1 ? "" : "s"} selected
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { onClose?.(); }}
                aria-label="Close download"
                className="shrink-0 rounded-full p-2 text-white/50 hover:text-white hover:bg-white/10 transition-colors mt-0.5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Scrollable body */}
          <div className="download-panel-scroll px-5 sm:px-6 py-4 sm:py-5 space-y-4 overflow-y-auto flex-1 min-h-0">

            {/* Series: season + episodes */}
            {isTv && resolveState.status !== "error" && (
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2.5">
                  Episodes
                </p>
                <div className="relative mb-2.5">
                  <select
                    value={selectedSeason}
                    onChange={(e) => {
                      setSelectedSeason(Number(e.target.value));
                      setSelectedEpisodes(new Set([1]));
                    }}
                    className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none focus:border-white/25"
                    aria-label="Season"
                  >
                    {Array.from({ length: Math.max(1, Number(movie?.seasonsCount) || 1) }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n} className="bg-[#141414]">
                        Season {n}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
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
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/[0.04] transition-colors"
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
              </section>
            )}

            {/* Sources header */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" />
                Sources
              </p>
              {resolveState.status === "resolving" && (
                <span className="flex items-center gap-1.5 text-[11px] text-white/35">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {resolveState.done}/{resolveState.total} scanned
                </span>
              )}
            </div>

            {/* Quality filter chips */}
            {qualityGroups.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by quality">
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

            {/* Skeleton while first source resolves */}
            {resolveState.status === "resolving" && sortedRows.length === 0 && (
              <div className="space-y-2.5" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-[60px] rounded-xl border border-white/[0.06] bg-white/[0.03] animate-pulse"
                  />
                ))}
              </div>
            )}

            {/* Resolve error */}
            {resolveState.status === "error" && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3.5 text-sm text-amber-200/90">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="leading-relaxed">{resolveState.error}</p>
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
              <div className="space-y-2.5" role="list" aria-label="Available downloads">
                {visibleRows.map((row) => {
                  const isTop = row.key === topKey;
                  const isActive = downloadState.rowKey === row.key && isDownloading;
                  return (
                    <div
                      key={row.key}
                      role="listitem"
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                        isActive
                          ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                          : "border-white/[0.07] bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white truncate max-w-[14rem]">{fileTitle}</span>
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-white/10 text-white/80">
                            {row.label}
                          </span>
                          {isTop && (
                            <span
                              className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-black"
                              style={{ background: "var(--accent-gradient)" }}
                            >
                              <Star className="w-3 h-3" fill="currentColor" /> BEST
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-white/40 truncate">
                          {row.serverName} · {sizeLabelFor(row.variant)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownload(row)}
                        disabled={!canPickSource || (isTv && selectedEpisodes.size === 0)}
                        aria-label={`Download ${row.label} of ${fileTitle} from ${row.serverName}`}
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-transform active:scale-[0.97]"
                        style={{ background: "var(--accent-gradient)", color: "var(--on-accent, #fff)" }}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {isTv && selectedEpisodes.size > 1 ? `${selectedEpisodes.size} eps` : "Download"}
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

            {/* Download progress */}
            {isDownloading && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
                <div className="flex items-center justify-between gap-2 text-xs text-white/60 mb-2.5">
                  <span className="truncate">
                    {downloadState.total > 1
                      ? `Episode ${downloadState.episodeIndex + 1} of ${downloadState.total}`
                      : "Downloading…"}
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
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
                  <p className="mt-2 text-[11px] text-white/35">
                    {downloadState.progress.bytesLabel}
                    {downloadState.progress.totalBytes > 0
                      ? ` / ${formatBytes(downloadState.progress.totalBytes)}`
                      : ""}
                    {" downloaded"}
                  </p>
                )}
              </div>
            )}

            {/* Download error */}
            {downloadState.status === "error" && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3.5 text-sm text-red-200/90">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="flex-1 min-w-0 leading-relaxed">{downloadState.error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 flex flex-col sm:flex-row sm:items-center gap-3 px-5 sm:px-6 py-4 border-t border-white/[0.08]">
            <p className="flex-1 text-[11px] leading-relaxed text-white/30">
              Qualities depend on what each source server offers. Protected (DRM) streams cannot be downloaded. Only download content you have the right to keep.
            </p>
            {isDownloading ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="shrink-0 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/[0.06] transition-colors"
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
