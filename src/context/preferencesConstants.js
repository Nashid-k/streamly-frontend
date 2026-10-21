/* ── Language-sensitive query prefixes ────────────────────────────────────
   Every React Query key whose cached payload is language-dependent. The TMDB
   query keys are language-AGNOSTIC (`["popular"]`, `["top10"]`, `["movie", id]`
   …) while the actual request reads the language from localStorage at call time
   (api/tmdbClient.js → getActiveLanguage). So a language change cannot rely on
   key re-keying — it MUST invalidate these prefixes to pull new-language data.

   Kept here, rather than in PreferencesContext, because two places need the
   exact same set: the invalidation on switch, and LanguageSwitchOverlay, which
   waits for that same set to settle so it can reveal the fresh UI. One list =
   no drift between "what we refetch" and "what we wait for". */
export const LANGUAGE_SENSITIVE_QUERY_PREFIXES = Object.freeze([
  ["movie"],
  ["similar"],
  ["episodes"],
  ["person"],
  ["search"],
  ["genre-search"],
  ["genre-showcase"],
  ["categories"],
  ["category-fallback"],
  ["featuredMovies"],
  ["airing-this-week"],
  ["trending-this-week"],
  ["top10"],
  ["popular"],
  ["topRated"],
  ["nowPlaying"],
  ["upcoming-regional"],
  ["airing-regional"],
  ["new-releases"],
  ["recommendations"],
  ["discover"],
  ["discover-genres"],
  ["discover-providers"],
  ["discover-regions"],
  ["discover-rail"],
  ["discover-series-upcoming"],
  ["titleLogo"],
  ["editorial"],
]);
