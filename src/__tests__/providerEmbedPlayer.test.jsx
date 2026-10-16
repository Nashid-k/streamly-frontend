import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../test/testUtils";
import ProviderEmbedPlayer, {
  providerEmbedUrl,
  PROVIDER_EMBED_ORIGIN,
} from "../components/ProviderEmbedPlayer";

/* The player route is the provider's own "custom player" scheme, read from its route
   (2026-10-16): `/player/{media_type}/{tmdbId}` with series season/episode as
   query params. A wrong route opens the provider site, so the shape is pinned. */

describe("providerEmbedUrl", () => {
  it("builds a movie player URL from the tmdb id", () => {
    expect(providerEmbedUrl({ type: "movie", id: 27205 })).toBe(
      `${PROVIDER_EMBED_ORIGIN}/player/movie/27205`,
    );
  });

  it("builds a TV player URL with season and episode query, defaulting to S1E1", () => {
    expect(providerEmbedUrl({ type: "tv", id: 1399, season: 2, episode: 5 })).toBe(
      `${PROVIDER_EMBED_ORIGIN}/player/tv/1399?season=2&episode=5`,
    );
    expect(providerEmbedUrl({ type: "tv", id: 1399 })).toBe(
      `${PROVIDER_EMBED_ORIGIN}/player/tv/1399?season=1&episode=1`,
    );
  });

  it("returns an empty string without an id", () => {
    expect(providerEmbedUrl({ type: "movie", id: "" })).toBe("");
    expect(providerEmbedUrl({ type: "movie" })).toBe("");
  });
});

describe("ProviderEmbedPlayer", () => {
  it("mounts the provider player in an iframe and closes via the back button", () => {
    const onClose = vi.fn();
    const { container } = renderWithProviders(
      <ProviderEmbedPlayer type="movie" id="27205" title="Inception" onClose={onClose} />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute("src")).toBe(`${PROVIDER_EMBED_ORIGIN}/player/movie/27205`);
    expect(iframe.getAttribute("allowfullscreen")).not.toBeNull();

    fireEvent.click(screen.getByLabelText("Close player"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an honest message instead of an empty frame when the id is missing", () => {
    const { container } = renderWithProviders(
      <ProviderEmbedPlayer type="movie" id="" title="Unknown" onClose={() => {}} />,
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText(/no identifiable source/i)).toBeInTheDocument();
  });
});
