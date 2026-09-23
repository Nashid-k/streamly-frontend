import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Download,
  Loader2,
  Pause,
  Play,
  RotateCw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import AmbientBackground from "../components/AmbientBackground";
import { useDownloads } from "../context/downloads";
import { useI18n } from "../i18n/index.jsx";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { formatBytes } from "../utils/downloadQuality";

/* ── Downloads page — session download manager ──────────────────────────────
   Mirrors the Movies/Shows discovery theme (AmbientBackground + glass
   header + discovery-grid) but each card is a D/L row: poster thumbnail,
   title, quality/server meta, live progress while downloading, and
   cancel/remove actions. Reads the session-local DownloadsContext that
   DownloadModal writes into. */

const STATUS_META = {
  downloading: { label: "downloads.downloading", color: "#4bc915" },
  paused: { label: "downloads.paused", color: "#f59e0b" },
  done: { label: "downloads.done", color: "var(--accent-primary)" },
  error: { label: "downloads.failed", color: "#f87171" },
  cancelled: { label: "downloads.cancelled", color: "#9ca3af" },
};

function statusLabel(status, t) {
  return t(STATUS_META[status]?.label || "downloads.pending");
}

function DownloadCard({ download, t, onPause, onResume, onRetry, onCancel, onRemove }) {
  const { title, posterUrl, backdropUrl, quality, serverName, status, progress, episodeCount } = download;
  const imgUrl = CdnImageAdapter.getUrl(posterUrl || backdropUrl, "w185");
  const pct = progress?.ratio ? Math.round(progress.ratio * 100) : 0;
  const isDownloading = status === "downloading";
  const isPaused = status === "paused";
  const showsProgress = isDownloading || isPaused;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex items-center gap-3 sm:gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 sm:p-4"
    >
      <div className="relative w-[52px] h-[78px] shrink-0 overflow-hidden rounded-lg bg-white/5 sm:w-[60px] sm:h-[90px]">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="block w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-white/[0.04] to-white/[0.08] text-white/25 text-xl font-extrabold">
            {(title || "?").charAt(0).toUpperCase()}
          </div>
        )}
        {status === "done" && (
          <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "var(--accent-gradient)" }}>
            <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate text-sm font-semibold text-white">{title || "Untitled"}</h3>
          {quality && (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-white/10 text-white/80">
              {quality}
            </span>
          )}
          {episodeCount > 1 && (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-white/10 text-white/80">
              {episodeCount} episodes
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-white/40">
          {serverName || "Streamly"}
          {showsProgress && progress?.bytesLabel
            ? ` · ${progress.bytesLabel}${progress.totalBytes > 0 ? ` / ${formatBytes(progress.totalBytes)}` : ""}`
            : ""}
        </p>

        {showsProgress && (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-2 text-[11px] text-white/50 mb-1">
              <span className="flex items-center gap-1.5">
                {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />}
                {statusLabel(status, t)}
              </span>
              <span className="flex items-center gap-2.5">
                {isDownloading && progress?.speed > 0 && <span className="text-white/40">{formatBytes(progress.speed)}/s</span>}
                <span>{pct}%</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full"
                style={{ background: "var(--accent-gradient)" }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
          </div>
        )}

        {status === "error" && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-300/90 truncate">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {download.error || "Download failed."}
          </p>
        )}

        {!showsProgress && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/40">
            <Download className="w-3 h-3 shrink-0" />
            <span>{statusLabel(status, t)}</span>
            {progress?.bytesLabel ? <span> · {progress.bytesLabel}</span> : null}
          </p>
        )}
      </div>

      <div className="shrink-0 flex flex-col gap-1.5">
        {isDownloading && (
          <button
            type="button"
            onClick={onPause}
            aria-label={`Pause download of ${title || "title"}`}
            title="Pause"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/[0.06] transition-colors"
          >
            <Pause className="w-3 h-3" /> Pause
          </button>
        )}
        {isPaused && (
          <button
            type="button"
            onClick={onResume}
            aria-label={`Resume download of ${title || "title"}`}
            title="Resume"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/[0.06] transition-colors"
          >
            <Play className="w-3 h-3" /> Resume
          </button>
        )}
        {status === "error" && (
          <button
            type="button"
            onClick={onRetry}
            aria-label={`Retry download of ${title || "title"}`}
            title="Retry"
            className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-black transition-transform active:scale-[0.98]"
            style={{ background: "var(--accent-gradient)" }}
          >
            <RotateCw className="w-3 h-3" /> Retry
          </button>
        )}
        {isDownloading || isPaused || status === "error" ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label={`Cancel download of ${title || "title"}`}
            title="Cancel"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <X className="w-3 h-3" /> Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${title || "title"} from downloads`}
            title="Remove"
            className="flex items-center justify-center rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function DownloadsPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { downloads, activeCount, cancelDownload, removeDownload } = useDownloads();

  const ambientSrc = useMemo(() => {
    const active = downloads.find((d) => d.status === "downloading");
    const anyRec = downloads.find((d) => d.backdropUrl || d.posterUrl);
    return (active?.backdropUrl || active?.posterUrl || anyRec?.backdropUrl || anyRec?.posterUrl || null);
  }, [downloads]);

  const doneCount = downloads.filter((d) => d.status === "done").length;

  return (
    <div style={{ position: "relative" }}>
      <AmbientBackground src={ambientSrc} fallback />

      <div className="discovery-page relative z-10">
        <header className="relative mx-auto max-w-[1600px] pt-24 pb-8 px-4 md:px-10 lg:px-14">
          <div className="relative pt-12 pb-8 px-6 md:px-8 space-y-8">
            <div className="flex flex-col xl:flex-row gap-10 xl:gap-8 items-start xl:items-end justify-between">
              <div className="max-w-xl">
                <span className="block text-sm font-semibold uppercase tracking-[0.2em] text-white/50 mb-3">
                  {t("downloads.eyebrow")}
                </span>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white drop-shadow-lg">
                  {t("nav.downloads")}
                </h1>
                <p className="mt-3 text-lg text-white/70 font-medium leading-relaxed">
                  {t("downloads.subtitle", { active: String(activeCount), done: String(doneCount) })}
                </p>
              </div>

              {downloads.length > 0 && (
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition-colors"
                >
                  <Send className="w-4 h-4" />
                  {t("downloads.explore")}
                </Link>
              )}
            </div>
          </div>
        </header>

        <section className="px-4 md:px-8 mt-4 relative z-10">
          {downloads.length === 0 ? (
            <div style={{ padding: "5rem 0", textAlign: "center", color: "#a1a1aa" }} className="max-w-[1600px] mx-auto px-2">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-white/[0.05] flex items-center justify-center mb-4">
                <Download className="w-6 h-6 text-white/40" />
              </div>
              <h2 className="text-2xl font-bold text-white">{t("downloads.emptyTitle")}</h2>
              <p className="max-w-md mt-2 text-white/60">{t("downloads.emptyDesc")}</p>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-transform active:scale-[0.98]"
                style={{ background: "var(--accent-gradient)", color: "var(--on-accent, #fff)" }}
              >
                <Download className="w-4 h-4" />
                {t("downloads.discover")}
              </button>
            </div>
          ) : (
            <div className="max-w-[1600px] mx-auto">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {downloads.map((d) => (
                    <DownloadCard
                      key={d.id}
                      download={d}
                      t={t}
                      onPause={() => d.pause?.()}
                      onResume={() => d.resume?.()}
                      onRetry={() => d.retry?.()}
                      onCancel={() => cancelDownload(d.id)}
                      onRemove={() => removeDownload(d.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}