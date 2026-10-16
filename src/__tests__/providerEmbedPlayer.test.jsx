import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../test/testUtils";
import ProviderEmbedPlayer, {
  providerEmbedUrl,
  PROVIDER_EMBED_ORIGIN,
} from "../components/ProviderEmbedPlayer";

/* The embed route is the provider's own scheme, read from its shipped chunk
   (2026-10-16): `/embed/{media_type}/{tmdbId}[/{season}/{episode}]`. A wrong
   URL silently lands the viewer on the provider's SPA shell, so the shape is
   pinned here. */

describe("providerEmbedUrl", () => {
  it("builds a movie embed URL from the tmdb id", () => {
    expect(providerEmbedUrl({ type: "movie", id: 27205 })).toBe(
      `${PROVIDER_EMBED_ORIGIN}/embed/movie/27205`,
    );
  });

  it("builds a TV embed URL with season and episode, defaulting to S1E1", () => {
    expect(providerEmbedUrl({ type: "tv", id: 1399, season: 2, episode: 5 })).toBe(
      `${PROVIDER_EMBED_ORIGIN}/embed/tv/1399/2/5`,
    );
    expect(providerEmbedUrl({ type: "tv", id: 1399 })).toBe(
      `${PROVIDER_EMBED_ORIGIN}/embed/tv/1399/1/1`,
    );
  });

  it("returns an empty string without an id", () => {
    expect(providerEmbedUrl({ type: "movie", id: "" })).toBe("");
    expect(providerEmbedUrl({ type: "movie" })).toBe("");
  });
});

describe("ProviderEmbedPlayer", () => {
  it("mounts the provider embed in an iframe and closes via the back button", () => {
    const onClose = vi.fn();
    const { container } = renderWithProviders(
      <ProviderEmbedPlayer type="movie" id="27205" title="Inception" onClose={onClose} />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute("src")).toBe(`${PROVIDER_EMBED_ORIGIN}/embed/movie/27205`);
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
