import React from "react";
import { Link } from "react-router-dom";

/**
 * One row-head for every rail: a title on the left, a quiet "See all" on the
 * right. It owns ONLY the `.rail-head` / `.rail-head__main` / `.rail-see-all`
 * markup — no arrows, no windowing, no card knowledge — so the three rails that
 * hand-rolled this block (MovieRail, ContinueWatchingRail, Top10Rail) can share
 * one source of truth without inventing a rail-system abstraction.
 *
 * `title` is a node because the rails legitimately differ: a plain <h3>, a
 * linked <h2> with a hover chevron, or an <h3> carrying a gradient span.
 * Omitting `seeAllTo` renders the title alone (no empty flex slot) — Top 10 has
 * no destination to link to, and inventing a route for a link is not allowed.
 *
 * `actions` is for row-level controls that belong on the far side of the title
 * (e.g. Continue Watching's edit toggle), so a rail never stacks a control row
 * underneath its head.
 */
const SectionHeader = React.memo(function SectionHeader({
  title,
  seeAllTo,
  seeAllState,
  seeAllLabel = "See all",
  actions,
  padded = true,
}) {
  return (
    <div className="rail-head" style={padded ? { paddingLeft: "0.25rem" } : undefined}>
      <div className="rail-head__main">{title}</div>
      {actions || seeAllTo ? (
        <div className="rail-head__actions">
          {actions}
          {seeAllTo ? (
            <Link
              to={seeAllTo}
              state={seeAllState}
              className="rail-see-all"
              style={{ textDecoration: "none" }}
            >
              {seeAllLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

export default SectionHeader;
