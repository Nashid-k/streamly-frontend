import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { usePreferenceValue } from "../context/preferences";
import { pickImageWidth, sceneHues } from "../utils/artwork";

/** 2.0 Details skeleton (`article.dp.sk-detail` mirroring `streamly_2.0.html`).
    Used both inside `.detail-transition-overlay` during A->B->C / C->B->A phase B
    and directly on `TitleDetailsPage` while initial route data loads. Preserves
    the source poster & scene backdrop art when available so Chromium View
    Transitions morph crisp artwork rather than collapsing into grey boxes. */
function MovieDetailsSkeleton({
  titleId = null,
  isTv = null,
  session = null,
  hasBackdrop = true,
  posterUrl = null,
  backdropUrl = null,
  title = "",
}) {
  const hdThumbs = usePreferenceValue("hdThumbs");
  const resolvedId = session?.movieId ?? session?.sourceId ?? titleId ?? "";
  const [hueA, hueB] = sceneHues(resolvedId || "streamly-detail");
  const showEpisodes =
    typeof isTv === "boolean"
      ? isTv
      : typeof session?.isTv === "boolean"
        ? session.isTv
        : String(resolvedId).startsWith("tmdb-tv-");

  const resolvedPosterPath = posterUrl || session?.posterUrl || "";
  const resolvedBackdropPath = backdropUrl || session?.backdropUrl || "";
  const posterOptimized = resolvedPosterPath
    ? CdnImageAdapter.getUrl(resolvedPosterPath, pickImageWidth("card", { hdThumbs }))
    : null;
  const backdropOptimized = resolvedBackdropPath
    ? CdnImageAdapter.getBackdropUrl(resolvedBackdropPath)
    : null;
  const resolvedTitle = title || session?.title || "";
  const initialChar = (resolvedTitle || "?").trim().charAt(0).toUpperCase();

  return (
    <article
      className="dp sk-detail"
      style={{ "--a": hueA, "--b": hueB }}
      data-has-backdrop={hasBackdrop ? "true" : "false"}
      aria-hidden="true"
    >
      <div
        className="bdp"
        data-art-ready={backdropOptimized ? "true" : undefined}
        style={{ "--a": hueA, "--b": hueB }}
      >
        {backdropOptimized ? (
          <div
            className="bdp-art"
            style={{ backgroundImage: `url(${backdropOptimized})` }}
          />
        ) : null}
      </div>
      <div className="sk sk-back" />

      <div className="dh">
        <div
          className="po sk detail-transition-poster"
          data-initial={initialChar}
          data-loaded={posterOptimized ? "true" : undefined}
          style={{ "--a": hueA, "--b": hueB }}
        >
          {posterOptimized ? (
            <img
              className="po-img"
              src={posterOptimized}
              alt=""
              loading="eager"
              decoding="async"
            />
          ) : null}
        </div>
        <div className="dtx">
          <div className="chips">
            <div className="sk sk-chip" />
            <div className="sk sk-chip" />
            <div className="sk sk-chip" />
          </div>
          <div className="sk sk-dt" />
          <div className="sk sk-tag" />
          <div className="btns">
            <div className="sk sk-btn" />
            <div className="sk sk-btn sm" />
            <div className="sk sk-btn sm" />
          </div>
        </div>
      </div>

      <div className="dg">
        <div className="dg-main">
          <section>
            <div className="sk sk-h3" />
            <div className="sk-ov">
              <div className="sk sk-line" />
              <div className="sk sk-line mid" />
              <div className="sk sk-line short" />
            </div>
          </section>
          <section>
            <div className="sk sk-h3" />
            <div className="sk-cast">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="sk-cast-card">
                  <div className="sk sk-face" />
                  <div className="sk sk-castname" />
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="dg-side">
          <div className="facts glass sk-facts">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="sk-fact-row">
                <div className="sk sk-fact-k" />
                <div className="sk sk-fact-v" />
              </div>
            ))}
          </div>
        </aside>
      </div>

      {showEpisodes && (
        <section className="sk-eps">
          <div className="sk sk-h3" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="sk-ep">
              <div className="sk sk-epimg" />
              <div>
                <div className="sk sk-epline" />
                <div className="sk sk-epline short" />
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="sk-detail-rails">
        <div>
          <div className="sk sk-h3" />
          <div className="sk-rail-cards">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="sk-rail-card">
                <div className="po sk" />
                <div className="sk sk-ctitle" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export default MovieDetailsSkeleton;
