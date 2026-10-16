// src/components/ProviderEmbedPlayer.jsx — playback through the PROVIDER'S OWN
// player, embedded same as the title's own page embeds it.
//
// Why this exists: the ZXC/vidstuck backend migrated to a v2 API whose token
// mint (`POST /backend/fucku`) rejects every server-side request we can make
// (400 "Invalid request" for every body/hash/origin permutation) while the
// provider's page mints and plays fine IN A BROWSER. Our own HLS player needs
// the decoded manifest, which we can no longer obtain server-side, so the only
// reliable path is to let the provider's client do the mint/embed dance inside
// an iframe — the browser context it is built for.
//
// The provider's own embed route is `/embed/{media_type}/{tmdbId}[/{season}/
// {episode}]` and its page then fetches the minted `embed` URL and renders it
// as a nested iframe (read from the shipped chunk 0mnx9p2vu2a3l.js, 2026-10-16).
// It sends no X-Frame-Options / CSP, so framing is intended.
//
// This is a deliberate fallback to the provider's UI (their ads, their chrome).
// It restores playback; it does not reproduce the app's native chrome. Callers
// pick it via PROVIDER_EMBED_PLAYBACK in ../constants/playback.js.

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Loader from "./Loader";
import { logError } from "../utils/debugLogger";

/* The single provider host we embed. Kept as its own export so the URL builder
   and the CSP in vercel.json name the same origin in one place. */
export const PROVIDER_EMBED_ORIGIN = "https://zxcstream.cc";

// How long the top bar lingers after the last pointer move before it fades, so
// the provider's picture is not permanently covered by our chrome.
const CHROME_IDLE_MS = 3000;

/* Build the provider embed URL for a title. Movie → `/embed/movie/{id}`;
   TV → `/embed/tv/{id}/{season}/{episode}`. Returns "" when there is no usable
   id, which the caller renders as an honest error instead of an empty frame. */
export function providerEmbedUrl({ type = "movie", id, season = 1, episode = 1 } = {}) {
  const media = type === "tv" ? "tv" : "movie";
  const tmdbId = String(id ?? "").trim();
  if (!tmdbId) return "";
  let url = `${PROVIDER_EMBED_ORIGIN}/embed/${media}/${encodeURIComponent(tmdbId)}`;
  if (media === "tv") {
    const s = Math.max(1, Number(season) || 1);
    const e = Math.max(1, Number(episode) || 1);
    url += `/${s}/${e}`;
  }
  return url;
}

export default function ProviderEmbedPlayer({ type, id, season, episode, title, subtitle, notice, onClose }) {
  const [loaded, setLoaded] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const idleTimerRef = useRef(null);
  // The page remounts this component per watch session, but onClose can change
  // identity between renders; read it through a ref so the Escape handler binds
  // once and still calls the latest close.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const url = providerEmbedUrl({ type, id, season, episode });

  useEffect(() => {
    if (!url) logError("player", "provider embed: no tmdb id for the requested title", { type, id });
  }, [url, type, id]);

  // Escape closes the player. It fires only while OUR document owns focus; once
  // the provider iframe takes the keyboard, its own chrome owns the keys — the
  // on-screen Back button is the guaranteed exit.
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
        background: "#000",
        overflow: "hidden",
      }}
    >
      {url ? (
        <iframe
          key={url}
          src={url}
          title={title ? `${title}${subtitle ? ` — ${subtitle}` : ""}` : "Stream player"}
          onLoad={() => setLoaded(true)}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="origin"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: 0,
            display: "block",
            background: "#000",
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

      {/* Loading veil: covers the provider's own black-until-ready frame so a
          slow embed reads as "loading", not "broken". */}
      {url && !loaded && (
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

      {/* Top bar: our only chrome. Back is always reachable while it shows; it
          fades after a few idle seconds so it never permanently covers the
          provider's controls. Mirrors the player's top gradient. */}
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
          transition: "opacity 0.3s ease",
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
            color: "#fff",
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={22} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: "#fff",
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
          {notice ? (
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>{notice}</div>
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
              color: "#fff",
            }}
          >
            <ExternalLink size={18} />
          </a>
        )}
      </div>
    </div>
  );
}
