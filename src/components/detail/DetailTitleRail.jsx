import MovieCard from "../MovieCard";

/* ── Details-page title rail ──────────────────────────────────────────────
   One horizontal strip of MovieCards for the two context rails the details
   page adds beside "You Might Also Like": a franchise's parts ("Part of …")
   and a studio's catalogue ("More from …").

   It exists so those two rows share ONE geometry: cards sized like the rail
   they sit next to (140/200px), the heading's 8px optical inset instead of a
   second page gutter (the parent column already carries .details-gutter), and
   no per-card entrance animation (rails reveal as one block — same rule as
   MovieRail, and 20 staggered framer nodes per row is main-thread work for no
   information).

   `currentId` marks the title the viewer is already on. In a franchise rail
   that row is included on purpose (a series reads as incomplete without its
   entry point), but it is visibly "you are here" so it can never be mistaken
   for another unwatched part. */
export default function DetailTitleRail({ titles, currentId = null, badgeLabel = "You're here", ariaLabel }) {
  if (!Array.isArray(titles) || titles.length === 0) return null;
  return (
    <div className="detail-rail" role="list" aria-label={ariaLabel || undefined}>
      {titles.map((title) => {
        const isCurrent = currentId != null && String(title.id) === String(currentId);
        return (
          <div
            key={title.id}
            role="listitem"
            className={`detail-rail__item${isCurrent ? " is-current" : ""}`}
          >
            <MovieCard movie={title} />
            {isCurrent ? <span className="detail-rail__badge">{badgeLabel}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
