import { act, screen, fireEvent } from "@testing-library/react";
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

/* A cross-origin frame can only report "never loaded". Without a watchdog the
   loading veil covered the provider forever, with no retry — the same dead-end
   the CineSrc embed had. */
describe("ProviderEmbedPlayer load watchdog", () => {
  it("offers a retry when the frame never loads, and re-keys it on retry", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderWithProviders(
        <ProviderEmbedPlayer type="movie" id="27205" title="Inception" onClose={() => {}} />,
      );
      expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

      act(() => vi.advanceTimersByTime(20_000));
      expect(screen.getByText(/provider player didn.t load/i)).toBeInTheDocument();

      const firstFrame = container.querySelector("iframe");
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      // A fresh key forces the browser to re-request the same URL.
      expect(container.querySelector("iframe")).not.toBe(firstFrame);
      expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the watchdog once the frame loads", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderWithProviders(
        <ProviderEmbedPlayer type="movie" id="27205" title="Inception" onClose={() => {}} />,
      );
      fireEvent.load(container.querySelector("iframe"));

      act(() => vi.advanceTimersByTime(60_000));
      expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
