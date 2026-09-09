import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";

/* Hero banner title logo. Renders the movie's actual wordmark/logo image.
   If the movie was loaded from a list endpoint (rail, trending) it has no
   logoUrl, so we lazily fetch it from TMDB once per id and cache it via
   React Query — subsequent slides render immediately. Falls back to the
   styled text title only when the title genuinely has no logo on TMDB. */
export default function HeroTitleLogo({ movie }) {
  const { data: url } = useQuery({
    queryKey: ["titleLogo", movie.id],
    queryFn: () => movieService.getTitleLogo(movie.id),
    enabled: !movie.logoUrl,
    staleTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });

  const logoUrl = movie.logoUrl || url;

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={movie.title}
        className="hero-logo-img"
        loading="eager"
        decoding="async"
      />
    );
  }

  return <h1 className="hero-title">{movie.title}</h1>;
}