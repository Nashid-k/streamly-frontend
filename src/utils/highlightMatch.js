/* Splits `text` around the first case-insensitive occurrence of `query` so a
   component can wrap the hit span in <mark> (or anything else).

   Deliberately returns data, not elements: the search highlight is a pure
   string problem and belongs in a unit test, not in a render tree.

   Rules:
   - Empty / whitespace-only query → one unmarked segment (the whole string).
   - No occurrence → one unmarked segment (no degraded styling, no crash).
   - Only the FIRST occurrence is marked. The viewer types a phrase; lighting
     up every repeat of a short token ("the", "man") turns a card into a
     Christmas tree and hides the part that actually matched.
   - Case-insensitive, accent-insensitive lookup is intentionally NOT done:
     TMDB titles are what the viewer sees, so a literal substring match is the
     only rule that never surprises (marking "Amélie" for "amelie" would be
     wrong either way, and half-marking it is worse than not marking it). */
export function highlightSegments(text, query) {
  const haystack = typeof text === "string" ? text : "";
  const needle = typeof query === "string" ? query.trim().toLowerCase() : "";
  if (!haystack || !needle) return [{ text: haystack, hit: false }];

  const at = haystack.toLowerCase().indexOf(needle);
  if (at === -1) return [{ text: haystack, hit: false }];

  const segments = [
    { text: haystack.slice(0, at), hit: false },
    { text: haystack.slice(at, at + needle.length), hit: true },
    { text: haystack.slice(at + needle.length), hit: false },
  ].filter((seg) => seg.text.length > 0);
  return segments.length ? segments : [{ text: haystack, hit: false }];
}

export default highlightSegments;
