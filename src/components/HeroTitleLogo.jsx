import { useTitleLogo } from "../hooks/useTitleLogo";

/* Hero banner title logo. Renders the movie's actual wordmark/logo image.
   The lookup (list-fed movies have no logoUrl → fetch TMDB /images once per id,
   cached by React Query) and the text fallback both live in `useTitleLogo`, so
   the hero, the details hero and the player's cold-open stage can never again
   disagree about what counts as this title's logo.

   While the lookup is in flight we reserve the logo's slot instead of painting
   the styled text title — that avoids the text→logo flash the old flow had
   (image, then text, then logo). The text title still shows as the honest
   fallback when TMDB has no logo for the title. */
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
        fetchPriority="high"
        onError={onLogoError}
      />
    );
  }

  return <h1 className="hero-title">{movie.title}</h1>;
}
