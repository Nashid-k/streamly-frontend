import { memo, useState } from "react";

import { useAppAuth } from "../context/auth";
import HomeCard from "./home/HomeCard";
import HomeRail from "./home/HomeRail";
import { useI18n } from "../i18n/index.jsx";
import { progressPct, remainingSeconds } from "../utils/resumeProgress";

const formatTimeLeft = (seconds) => {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}hr ${rest}m left` : `${hours}hr left`;
  }
  return `${minutes}m left`;
};

const episodeLabel = (item) =>
  item.isSeries && item.savedSeason && item.savedEpisode
    ? `S${item.savedSeason}:E${item.savedEpisode}`
    : null;

const ContinueWatchingRail = memo(function ContinueWatchingRail({ items = [], rowIndex = 0 }) {
  const { t } = useI18n();
  const { removeFromContinueWatching } = useAppAuth();
  const [editMode, setEditMode] = useState(false);

  if (!items || items.length === 0) return null;

  const title = t("home.rails.continueWatching");
  const header = (
    <div className="home-rail-head">
      <h2>{title}</h2>
      <button
        type="button"
        className="cw-edit-btn"
        onClick={() => setEditMode((value) => !value)}
        aria-label={editMode ? t("common.doneEditing") : t("common.editList")}
        title={editMode ? t("common.doneEditing") : t("common.editList")}
        aria-pressed={editMode}
      >
        {editMode ? (
          <span className="cw-edit-btn__label">{t("common.done")}</span>
        ) : (
          <svg
            className="cw-edit-btn__icon"
            width="1em"
            height="1em"
            viewBox="0 0 512 512"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z"
            />
          </svg>
        )}
      </button>
    </div>
  );

  return (
    <HomeRail
      className="home-rails-lead"
      title={title}
      header={header}
      rowIndex={rowIndex}
      movies={items}
      renderItem={(item, index, detailToken) => {
        const remaining = formatTimeLeft(remainingSeconds(item));
        const label = episodeLabel(item);
        return (
          <HomeCard
            key={item.id}
            movie={item}
            index={index}
            detailToken={detailToken}
            progressValue={progressPct(item)}
            progressLabel={[label, remaining].filter(Boolean).join(" · ")}
            editMode={editMode}
            onRemove={() => removeFromContinueWatching(item.id)}
            wide
          />
        );
      }}
    />
  );
});

export default ContinueWatchingRail;
