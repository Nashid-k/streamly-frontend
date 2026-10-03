/* ── VidCore iframe fallback ────────────────────────────────────────────────
   vidrack's own player, embedded, as the last resort when no native source
   resolves.

   Why this exists: every native path to vidrack goes through the function on
   Vercel, and vidrack refuses Vercel's egress outright. Verified 2026-10-03 —
   `vidcore.io/movie/27205` answers 403 to the deployed function from both
   `iad1` and `bom1`, while `enc-dec.app`, `vidsrc.buzz`, `vidstuck.xyz` and
   `example.com` all answer 200 from the same function. Our header set is not
   the cause: replaying `server/net.js` `baseHeaders()` verbatim returns 200
   for every pooled UA and every single-header-drop combination. The block
   covers Vercel's AWS ranges as a whole, so no region pin avoids it.

   Embedding sidesteps that entirely and needs no proxy: the viewer's own
   browser loads vidrack directly, which is the one path vidrack serves
   normally. It is also explicitly permitted — vidrack sends no
   `X-Frame-Options` and no `frame-ancestors` — and `vidcore.io` is already in
   this app's CSP `frame-src` and `Permissions-Policy` allowlists.

   The cost is real and worth stating: the embed brings vidrack's player, not
   ours, so our quality ladder, dub menu and subtitle UI do not apply to it.
   It is therefore a FALLBACK, not a replacement — nothing here runs while a
   native resolve succeeds. */

const VIDCORE_ORIGIN = "https://vidcore.io";

/* Our accent, so the embed does not flash a different brand colour next to the
   rest of the player. Matches the legacy embed rotation this replaces. */
const DEFAULT_THEME = "0A84FF";

/**
 * Build the vidrack embed URL for a title.
 *
 * TMDB ids are preferred over IMDb ids: the native resolver is TMDB-keyed and
 * both forms serve the same page, so keeping one id shape across the app means
 * a title that resolves natively and a title that falls back cannot disagree
 * about which film they are.
 *
 * @param {{type?: string, id?: string|number, season?: string|number, episode?: string|number, theme?: string, autoPlay?: boolean}} args
 * @returns {string|null} the embed URL, or null when there is no usable id
 */
export function vidcoreEmbedUrl({
  type,
  id,
  season,
  episode,
  theme = DEFAULT_THEME,
  autoPlay = true,
} = {}) {
  const numericId = String(id ?? "").trim();
  if (!/^\d{1,12}$/.test(numericId)) return null;

  const isTv = type === "tv" && season !== "" && season !== undefined && season !== null
    && episode !== "" && episode !== undefined && episode !== null;

  const path = isTv
    ? `tv/${numericId}/${encodeURIComponent(String(season))}/${encodeURIComponent(String(episode))}`
    : `movie/${numericId}`;

  const params = new URLSearchParams({
    theme,
    autoPlay: autoPlay ? "true" : "false",
  });

  return `${VIDCORE_ORIGIN}/${path}?${params.toString()}`;
}

/**
 * Whether the native player should hand off to the vidrack embed.
 *
 * Deliberately conservative. An explicit Servers-menu pick is honoured unless
 * the pick IS vidcore — falling back to a different provider than the viewer
 * asked for would misreport what they chose, which is the same reasoning the
 * native rotation uses when it refuses to silently switch.
 *
 * @param {{requestedServerKey?: string|null, embedAttempted?: boolean}} args
 * @returns {boolean}
 */
export function shouldOfferVidcoreEmbed({
  requestedServerKey = null,
  embedAttempted = false,
} = {}) {
  if (embedAttempted) return false;
  if (requestedServerKey && requestedServerKey !== "vidcore") return false;
  return true;
}