const BASE_SERVERS = [
  {
    name: "Server 1",
    url: (id, s, e) =>
      s
        ? `https://cinesrc.st/embed/tv/${id}?s=${s}&e=${e}&color=%230A84FF&autoplay=true&controls=false&autonext=false`
        : `https://cinesrc.st/embed/movie/${id}?color=%230A84FF&autoplay=true&controls=false`,
  },
  {
    name: "Server 2 (Fast)",
    url: (id, s, e, imdb) =>
      s
        ? `https://vidlink.pro/tv/${imdb || id}/${s}/${e}`
        : `https://vidlink.pro/movie/${imdb || id}`,
  },
  {
    name: "Server 3 (HD)",
    url: (id, s, e, imdb) =>
      s
        ? `https://www.2embed.cc/embedtv/${imdb || id}&s=${s}&e=${e}`
        : `https://www.2embed.cc/embed/${imdb || id}`,
  },
  {
    name: "Server 4 (Backup)",
    url: (id, s, e, imdb) =>
      s
        ? `https://vidsrcme.ru/embed/tv?${imdb ? "imdb=" + imdb : "tmdb=" + id}&season=${s}&episode=${e}`
        : `https://vidsrcme.ru/embed/movie?${imdb ? "imdb=" + imdb : "tmdb=" + id}`,
  },
  {
    name: "Server 5 (VidCore)",
    url: (id, s, e, imdb) =>
      s
        ? `https://vidcore.io/tv/${id}/${s}/${e}?autoPlay=true&theme=0A84FF`
        : `https://vidcore.io/movie/${imdb || id}?autoPlay=true&theme=0A84FF`,
  },
  {
    name: "Server 6 (Peachify)",
    url: (id, s, e, imdb) =>
      s
        ? `https://peachify.top/embed/tv/${id}/${s}/${e}?autoNext=false&showNextBtn=false&accent=0A84FF`
        : `https://peachify.top/embed/movie/${imdb || id}?accent=0A84FF`,
  },
  {
    name: "Server 7 (VidUp)",
    url: (id, s, e, imdb) =>
      s
        ? `https://vidup.to/tv/${id}/${s}/${e}?autoPlay=true&theme=0A84FF&nextButton=false&autoNext=false`
        : `https://vidup.to/movie/${imdb || id}?autoPlay=true&theme=0A84FF`,
  },
  {
    name: "Server 8 (Smashy)",
    url: (id, s, e, _imdb) =>
      s
        ? `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`
        : `https://embed.smashystream.com/playere.php?tmdb=${id}`,
  },
];

export class VideoSourceAdapter {
  /* Server 1 (CineSrc iframe) is the default. Direct extraction and NetMirror
     were retired entirely (see task 11): Direct relayed every segment through
     the decommissioned stream-service proxy (buffer-stall source), and
     NetMirror's media CDN was unreliable. Server 1 + the iframe fallbacks are
     the stable path — every server in the rotation renders in an iframe, so
     no direct-stream resolution code remains anywhere.

     Server names were restored to the original player-dropdown labels
     (Server 1 … Server 8) from the pre-rename history; the URLs are
     unchanged. See LEGACY_SERVER_NAME_MAP in PreferencesContext for the
     Lisbon/Nebula/… → Server N rename migration. */
  static SERVERS = BASE_SERVERS;

  static getServers() {
    return this.SERVERS;
  }

  /**
   * Returns the server list re-ordered by the user's saved preference array.
   * Servers not in the preference list are appended at the end in default order.
   *
   * @param {string[]} serverOrder - Ordered names from preferences.serverOrder
   */
  static getOrderedServers(serverOrder) {
    const base = [...this.SERVERS];
    if (Array.isArray(serverOrder) && serverOrder.length > 0) {
      const nameMap = Object.fromEntries(base.map((s) => [s.name, s]));
      const seen = new Set();
      const result = [];
      for (const name of serverOrder) {
        if (nameMap[name] && !seen.has(name)) {
          result.push(nameMap[name]);
          seen.add(name);
        }
      }
      // Append any servers not referenced in the saved order
      for (const s of base) {
        if (!seen.has(s.name)) result.push(s);
      }
      return result;
    }

    return base;
  }

  static getStreamUrl(serverIndex, movieId, season, episode, imdbId) {
    const index =
      serverIndex >= 0 && serverIndex < this.SERVERS.length ? serverIndex : 0;
    const server = this.SERVERS[index];
    return server.url(movieId, season, episode, imdbId);
  }

  /* ── Ordered-list helpers ──────────────────────────────────────────
     The Settings page lets viewers re-order servers, and TitleDetails
     passes that ordered list into CustomVideoPlayer via the `servers`
     prop. These helpers resolve everything against the *passed* list so
     the player's indices always match the dropdown the viewer sees.
     Every helper falls back to the static base list when no list (or an
     empty list) is provided, so existing callers and tests keep working. */
  static count(list) {
    return Array.isArray(list) && list.length > 0 ? list.length : this.SERVERS.length;
  }

  static entryAt(list, serverIndex) {
    if (Array.isArray(list) && list.length > 0) {
      const bounded = serverIndex >= 0 && serverIndex < list.length ? serverIndex : 0;
      if (list[bounded]) return list[bounded];
    }
    return this.SERVERS[serverIndex] || this.SERVERS[0];
  }

  static resolveStreamUrl(list, serverIndex, movieId, season, episode, imdbId, title) {
    return this.entryAt(list, serverIndex).url(movieId, season, episode, imdbId, title);
  }
}
