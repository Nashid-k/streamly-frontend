export function selectGenreResults(rawResults, genre) {
  const normalizedGenre = String(genre || "").toLowerCase();
  if (!normalizedGenre) return [];

  // searchMovies returns a flat array. Treating it as a category object made
  // every direct /genre/:genre route look empty even when TMDB had matches.
  const mapped = Array.isArray(rawResults) ? rawResults.filter(Boolean) : [];

  // Filter to ensure the genre matches to prevent dirty search results.
  const strict = mapped.filter((movie) => {
    if (
      movie.genres &&
      movie.genres.some((itemGenre) => itemGenre.toLowerCase() === normalizedGenre)
    )
      return true;
    if (
      movie.tags &&
      movie.tags.some((tag) => tag.toLowerCase() === normalizedGenre)
    )
      return true;
    return false;
  });

  // No dirty fallback: only show titles that genuinely match the genre.
  // Searching by genre name returns fuzzy hits, so never spill them onto
  // the page when strict matching comes up short.
  const seen = new Set();
  return strict.filter((movie) => {
    if (seen.has(movie.id)) return false;
    seen.add(movie.id);
    return true;
  });
}
