import { Film, Star } from "lucide-react";
import { useI18n } from "../../i18n/index.jsx";

/* ── Search suggestion listbox ──────────────────────────────────────────────
   The dropdown under the query box. Purely presentational: the page owns the
   combobox state (open + highlight) because the input and its arrow keys are
   one ARIA control. The items are the search the page already fetched and
   ranked — the suggestions ARE the first rows of the grid below, lifted into
   a jump list, so there is no second request, no separate cache, and nothing
   can ever disagree with what the grid shows. */
function SearchSuggest({ items, activeIndex, listboxId, onSelect, onHover }) {
  const { t } = useI18n();
  if (!items?.length) return null;
  return (
    <ul
      id={listboxId}
      className="search-suggest"
      role="listbox"
      aria-label={t("search.suggest")}
    >
      {items.map((item, i) => (
        <li
          key={`${item.id}-${i}`}
          id={`${listboxId}-opt-${i}`}
          role="option"
          aria-selected={i === activeIndex}
          className={`search-suggest__item${i === activeIndex ? " is-active" : ""}`}
          /* Keep the caret in the box across the press: a click on the option
             must not blur the combobox first, or the list would be unmounted
             before its own click fires. Touch tap is unaffected by this. */
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onHover?.(i)}
          onClick={() => onSelect(item)}
        >
          {item.poster ? (
            <img className="search-suggest__poster" src={item.poster} alt="" loading="lazy" />
          ) : (
            <span
              className="search-suggest__poster search-suggest__poster--empty"
              aria-hidden="true"
            >
              <Film size={15} />
            </span>
          )}
          <span className="search-suggest__name">{item.title}</span>
          <span className="search-suggest__meta">
            <span className="search-suggest__badge">
              {item.isSeries ? t("search.suggestShow") : t("search.suggestMovie")}
            </span>
            {item.year ? <span className="search-suggest__year">{item.year}</span> : null}
            {item.rating ? (
              <span className="search-suggest__rating">
                <Star size={11} aria-hidden="true" /> {item.rating}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default SearchSuggest;
