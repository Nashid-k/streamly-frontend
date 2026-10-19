import { useTitleLogo } from "../hooks/useTitleLogo";

/* Hero banner title logo. Renders the movie's actual wordmark/logo image.
   The lookup (list-fed movies have no logoUrl → fetch TMDB /images once per id,
   cached by React Query) and the text fallback both live in `useTitleLogo`, so
   the hero, the details hero and the player's cold-open stage can never again
   disagree about what counts as this title's logo. */
export default function HeroTitleLogo({ movie }) {
  const { logoUrl, onLogoError } = useTitleLogo(movie, "HeroTitleLogo");

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={movie.title}
        className="hero-logo-img"
        loading="eager"
        decoding="async"
        onError={onLogoError}
      />
    );
  }

  return <h1 className="hero-title">{movie.title}</h1>;
}