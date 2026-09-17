/* Single source of truth for navigation — feeds the desktop glass dock and
   the concise five-item mobile bar. */

import { Home, Clapperboard, Tv, Bookmark } from "lucide-react";

// Kind of the title behind a details page (`/watch/<id>/...`) so the nav pill
// can light up correctly: `tv-*` / `tmdb-tv-*` ids are series, everything
// else on /watch is a movie. Mirrors movieService#isTvId.
export const navWatchKind = (path) => {
  const m = path.match(/^\/watch\/([^/]+)/);
  if (!m) return null;
  const id = m[1];
  return id.startsWith("tmdb-tv-") || id.startsWith("tv-") || id.includes("-tv-")
    ? "series"
    : "movie";
};

export const NAV_ITEMS = [
  { id: "home", label: "Home", to: "/", icon: Home, home: true, match: (p) => p === "/" },
  { id: "movies", label: "Movies", to: "/movies", icon: Clapperboard, match: (p) => p.startsWith("/movies") || navWatchKind(p) === "movie" },
  { id: "shows", label: "Shows", to: "/series", icon: Tv, match: (p) => p.startsWith("/series") || navWatchKind(p) === "series" },
  { id: "mylist", label: "My List", to: "/watchlist", icon: Bookmark, match: (p) => p === "/watchlist" },
];