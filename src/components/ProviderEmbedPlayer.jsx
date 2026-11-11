// src/components/ProviderEmbedPlayer.jsx — playback through the PROVIDER'S OWN
// player, embedded via its public "custom player" route.
//
// Why this exists: the ZXC/vidstuck backend put its /backend* API behind a
// Cloudflare WAF that blocks every datacenter IP, so our serverless resolver
// (and every proxy) is refused while the viewer's own (residential) browser is
// allowed. The provider's client-side player mints from the browser
// (`POST /backend/fucku` → `GET /backend_/sources/{server}`, links AES-sealed)
// and plays the decrypted DASH/HLS link — we cannot do that from our origin
// (the API emits no CORS), so we hand the whole job to the provider's player.
//
// We embed the CUSTOM PLAYER (`/player/{movie|tv}/{tmdbId}`), NOT the built-in
// `/embed/...` route: the built-in embed runs a separate sentinel handshake
// (`GET /backend_/embed/sentinel`) and shows a black screen, while the
// provider's own site uses the custom player. Series take season/episode as
// QUERY params — `/player/tv/{id}?season=&episode=` — read from the route's
// params (`["", "player", "movie", "27205"]`). The custom player emits no
// X-Frame-Options/CSP, so it embeds cleanly. TitleDetailsPage mounts this only
// when native playback is unavailable (no relay configured) or when
// PROVIDER_EMBED_PLAYBACK forces it (../constants/playback.js).

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
// A cross-origin frame gives us exactly one failure signal: "it never loaded".
// Each attempt arms this timer; onLoad clears it. Without it a refused embed
// leaves our loading veil up forever.
const EMBED_LOAD_TIMEOUT_MS = 20_000;

/* Build the provider custom-player URL for a title. Movie →
   `/player/movie/{id}`; TV → `/player/tv/{id}?season=&episode=`. Returns ""
   when there is no usable id, which the caller renders as an honest error
   instead of an empty frame. */
export function providerEmbedUrl({ type = "movie", id, season = 1, episode = 1 } = {}) {
  const media = type === "tv" ? "tv" : "movie";
  const tmdbId = String(id ?? "").trim();
  if (!tmdbId) return "";
  let url = `${PROVIDER_EMBED_ORIGIN}/player/${media}/${encodeURIComponent(tmdbId)}`;
  if (media === "tv") {
    const s = Math.max(1, Number(season) || 1);
    const e = Math.max(1, Number(episode) || 1);
    url += `?season=${s}&episode=${e}`;
  }
  return url;
}

export default function ProviderEmbedPlayer({
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
  // Bumped by "Try again" so the iframe reloads even though its URL is unchanged.
  const [embedNonce, setEmbedNonce] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const idleTimerRef = useRef(null);
  const embedTimerRef = useRef(null);
  // The page remounts this component per watch session, but onClose can change
  // identity between renders; read it through a ref so the Escape handler binds
  // once and still calls the latest close.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const url = providerEmbedUrl({ type, id, season, episode });

  useEffect(() => {
    if (!url) logError("player", "provider embed: no tmdb id for the requested title", { type, id });
  }, [url, type, id]);

  /* Load watchdog: every attempt re-arms it, a load clears it. A new URL or a
     retry also resets `loaded`, because the iframe is re-keyed and the old
     frame's onLoad must not cover the fresh attempt. */
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
        background: "var(--black)",
        overflow: "hidden",
      }}
    >
      {url ? (
        <iframe
          key={`${url}#${embedNonce}`}
          src={url}
          title={title ? `${title}${subtitle ? ` — ${subtitle}` : ""}` : "Stream player"}
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

      {/* Loading veil: covers the provider's own black-until-ready frame so a
          slow embed reads as "loading", not "broken". */}
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

      {/* The only failure a cross-origin frame can report is "never loaded".
          Say so honestly and offer the two exits instead of spinning forever. */}
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
            The provider player didn’t load.
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
