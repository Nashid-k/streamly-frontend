// src/components/AtlanticEmbedPlayer.jsx — playback through Atlantic's own
// player, embedded via its public watch route.
//
// Atlantic (atlantic.bz / atlantic.st) is a multi-provider aggregator with
// 4K support. Its stream resolution uses encrypted payloads delivered through
// totallyacdn.cc — reverse-engineering that protocol is fragile (keys rotate
// "within hours of discovery" per their own notice) and would break on every
// rotation. Instead we embed Atlantic's own player, the same way we already
// embed the ZXC provider's custom player (ProviderEmbedPlayer): the viewer's
// residential browser mints and plays the stream, no server-side resolve needed.
//
// Atlantic's watch route: /watch/{tmdbId} (movie) or /watch/{tmdbId}?s=&e=
// (TV). The page sets no X-Frame-Options / CSP blocking, so it embeds cleanly.

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Loader from "./Loader";
import { logError } from "../utils/debugLogger";

export const ATLANTIC_EMBED_ORIGIN = "https://atlantic.bz";

const CHROME_IDLE_MS = 3000;
const EMBED_LOAD_TIMEOUT_MS = 20_000;

export function atlanticEmbedUrl({ type = "movie", id, season = 1, episode = 1 } = {}) {
  const media = type === "tv" ? "tv" : "movie";
  const tmdbId = String(id ?? "").trim();
  if (!tmdbId) return "";
  let url = `${ATLANTIC_EMBED_ORIGIN}/watch/${encodeURIComponent(tmdbId)}`;
  if (media === "tv") {
    const s = Math.max(1, Number(season) || 1);
    const e = Math.max(1, Number(episode) || 1);
    url += `?s=${s}&e=${e}`;
  }
  return url;
}

export default function AtlanticEmbedPlayer({
  type,
  id,
  season,
  episode,
  title,
  subtitle,
  onClose,
}) {
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [embedNonce, setEmbedNonce] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const idleTimerRef = useRef(null);
  const embedTimerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const url = atlanticEmbedUrl({ type, id, season, episode });

  useEffect(() => {
    if (!url) logError("player", "atlantic embed: no tmdb id for the requested title", { type, id });
  }, [url, type, id]);

  useEffect(() => {
    if (!url) {
      setTimedOut(false);
      return undefined;
    }
    setLoaded(false);
    setTimedOut(false);
    embedTimerRef.current = setTimeout(() => setTimedOut(true), EMBED_LOAD_TIMEOUT_MS);
    return () => {
      if (embedTimerRef.current) clearTimeout(embedTimerRef.current);
      embedTimerRef.current = null;
    };
  }, [url, embedNonce]);

  const retryEmbed = () => {
    setTimedOut(false);
    setLoaded(false);
    setEmbedNonce((n) => n + 1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => clearTimeout(idleTimerRef.current), []);

  const pokeChrome = () => {
    setChromeVisible(true);
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
  };

  const close = () => {
    if (onCloseRef.current) onCloseRef.current();
    else window.history.back();
  };

  return (
    <div
      onMouseMove={pokeChrome}
      onPointerDown={pokeChrome}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "var(--black)",
        overflow: "hidden",
      }}
    >
      {url ? (
        <iframe
          key={`${url}#${embedNonce}`}
          src={url}
          title={title ? `${title}${subtitle ? ` — ${subtitle}` : ""}` : "Atlantic player"}
          onLoad={() => {
            if (embedTimerRef.current) clearTimeout(embedTimerRef.current);
            embedTimerRef.current = null;
            setTimedOut(false);
            setLoaded(true);
          }}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="origin"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: 0,
            display: "block",
            background: "var(--black)",
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.7)",
            fontSize: 15,
            textAlign: "center",
            padding: "0 2rem",
          }}
        >
          This title has no identifiable source to play.
        </div>
      )}

      {url && !loaded && !timedOut && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#050505",
            zIndex: 2,
          }}
        >
          <Loader variant="inline" size="40px" />
        </div>
      )}

      {url && timedOut && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: "0 2rem",
            textAlign: "center",
            background: "rgba(5,5,5,0.94)",
            zIndex: 4,
          }}
        >
          <div style={{ color: "var(--white)", fontSize: 16, fontWeight: 600 }}>
            The Atlantic player didn’t load.
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, maxWidth: 420 }}>
            Check your connection, then try again.
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <button
              type="button"
              onClick={retryEmbed}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "10px 22px",
                background: "var(--white)",
                color: "var(--black)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={close}
              style={{
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 999,
                padding: "10px 22px",
                background: "transparent",
                color: "var(--white)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          paddingTop: "max(12px, env(safe-area-inset-top))",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.75), rgba(0,0,0,0))",
          opacity: chromeVisible ? 1 : 0,
          transition: "opacity var(--duration-fast) var(--ease-out)",
          pointerEvents: chromeVisible ? "auto" : "none",
        }}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close player"
          title="Back"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.5)",
            color: "var(--white)",
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={22} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: "var(--white)",
              fontWeight: 600,
              fontSize: 15,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title || "Now playing"}
          </div>
          {subtitle ? (
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>{subtitle}</div>
          ) : null}
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open stream in a new tab"
            title="Open in new tab"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.5)",
              color: "var(--white)",
            }}
          >
            <ExternalLink size={18} />
          </a>
        )}
      </div>
    </div>
  );
}
