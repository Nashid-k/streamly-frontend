import { useI18n } from "../../i18n/index.jsx";
import RailMenu from "./RailMenu";

/* ── Because-you-watched anchor picker ─────────────────────────────────────
   The rail head where the anchor title is a bold underlined button whose
   dropdown lists the watch history and re-bases the rail on the picked title.
   The dropdown shell itself lives in RailMenu (shared with the provider
   rails); this component only supplies the label, the anchor and the items. */
function BecauseSelector({ anchor, items, onPick }) {
  const { t } = useI18n();

  const watched = (items || []).filter(Boolean);
  if (!anchor?.title) return null;

  return (
    <RailMenu
      label={t("home.rails.becauseWatched")}
      valueLabel={anchor.title}
      ariaLabel={t("home.rails.becauseWatched")}
      activeId={anchor.id}
      items={watched.map((m) => ({ id: m.id, label: m.title }))}
      onPick={onPick}
    />
  );
}

export default BecauseSelector;
