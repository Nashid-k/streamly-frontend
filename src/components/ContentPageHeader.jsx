import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * A consistent, compact introduction for the utility and browse pages.
 *
 * The home and title pages deliberately have their own cinematic layouts;
 * everything that asks a user to browse, filter, manage, or configure uses
 * this header so the task at hand is obvious before the grid begins.
 */
export default function ContentPageHeader({
  eyebrow,
  title,
  description,
  count,
  actions,
  backTo,
  onBack,
  backLabel = "Back",
  className = "",
}) {
  const backControl = backTo ? (
    <Link className="page-back" to={backTo}>
      <ArrowLeft size={16} aria-hidden="true" />
      {backLabel}
    </Link>
  ) : onBack ? (
    <button className="page-back" type="button" onClick={onBack}>
      <ArrowLeft size={16} aria-hidden="true" />
      {backLabel}
    </button>
  ) : null;

  return (
    <header className={`content-page-header ${className}`.trim()}>
      <div className="content-page-header__copy">
        {backControl}
        {eyebrow && <p className="content-page-header__eyebrow">{eyebrow}</p>}
        <div className="content-page-header__title-row">
          <h1>{title}</h1>
          {count !== undefined && <span className="page-count">{count}</span>}
        </div>
        {description && <p className="content-page-header__description">{description}</p>}
      </div>
      {actions && <div className="content-page-header__actions">{actions}</div>}
    </header>
  );
}
