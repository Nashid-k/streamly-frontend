import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import BrowseBanner from "../components/browse/BrowseBanner";
import { ratingService } from "../api/ratingService";
import { renderWithProviders } from "../test/testUtils";
import {
  getBannerMemory,
  setBannerMemory,
  clearBannerMemory,
} from "../utils/bannerMemory";

/* Contracts for the cross-route banner record (cinejoy parity — observed live
   on cinejoy.pk: home → movies keeps the exact banner that was on screen when
   the media kind matches, a kind mismatch swaps the banner over a skeleton):
     - a matching record renders the carried slide instead of the skeleton,
     - a mismatching record keeps the skeleton until the pool lands,
     - no record keeps the skeleton (first visit behavior unchanged),
     - the carried slide leads the landed pool without duplicating itself,
     - the on-screen slide is published back to the record,
     - the record module guards malformed writes. */

const CARRIED = {
  id: "tmdb-movie-100",
  title: "Carried Movie",
  mediaType: "movie",
  isSeries: false,
  releaseYear: 2020,
  backdropUrl: "https://example.com/carried.jpg",
  posterUrl: "https://example.com/carried-poster.jpg",
  logoUrl: "https://example.com/carried-logo.png",
  description: "The banner that was on screen.",
  genres: ["Action"],
  imdbRating: 8.1,
};

const poolMovie = (i) => ({
  id: `tmdb-movie-${200 + i}`,
  title: `Pool Movie ${i + 1}`,
  mediaType: "movie",
  releaseYear: 2021,
  backdropUrl: `https://example.com/pool-${i}.jpg`,
  posterUrl: `https://example.com/pool-${i}-poster.jpg`,
  logoUrl: `https://example.com/pool-${i}-logo.png`,
});

function renderBanner({ pool = [], loading = false, mediaType = "movie" } = {}) {
  return renderWithProviders(
    <BrowseBanner pool={pool} loading={loading} mediaType={mediaType} />,
    { route: "/movies" },
  );
}

const heroImg = () => document.querySelector(".hero-bg");
const skeletonSlot = () => document.querySelector(".skeleton-hero");

beforeEach(() => {
  clearBannerMemory();
  vi.spyOn(ratingService, "getRealRatings").mockResolvedValue(null);
});

afterEach(() => {
  clearBannerMemory();
  vi.restoreAllMocks();
});

describe("BrowseBanner cross-route carry", () => {
  it("renders the carried banner instead of the skeleton while the page's own pool is loading", async () => {
    setBannerMemory({ ...CARRIED });

    renderBanner({ loading: true });

    expect(skeletonSlot()).toBeNull();
    expect(heroImg().getAttribute("alt")).toBe("Carried Movie");
    expect(await screen.findByText(/the banner that was on screen/i)).toBeInTheDocument();
  });

  it("keeps the skeleton when the record's media kind does not match the page", () => {
    setBannerMemory({ ...CARRIED, mediaType: "tv", isSeries: true });

    renderBanner({ loading: true });

    expect(skeletonSlot()).not.toBeNull();
  });

  it("keeps the skeleton when there is no record (first visit behavior unchanged)", () => {
    renderBanner({ loading: true });

    expect(skeletonSlot()).not.toBeNull();
  });

  it("leads the landed pool with the carried slide without duplicating it", () => {
    setBannerMemory({ ...CARRIED });

    renderBanner({ pool: [CARRIED, poolMovie(0), poolMovie(1)] });

    expect(heroImg().getAttribute("alt")).toBe("Carried Movie");
    const dots = document.querySelectorAll(".hero-dot");
    expect(dots).toHaveLength(3);
    expect(dots[0].getAttribute("aria-label")).toBe("Show Carried Movie");
  });

  it("publishes the on-screen slide back to the record", () => {
    renderBanner({ pool: [poolMovie(0)] });

    expect(getBannerMemory()).toMatchObject({
      id: "tmdb-movie-200",
      mediaType: "movie",
      title: "Pool Movie 1",
    });
  });

  it("does not publish anything while the skeleton is up with no record", () => {
    renderBanner({ loading: true });

    expect(getBannerMemory()).toBeNull();
  });
});

describe("bannerMemory record", () => {
  it("ignores malformed writes and clears cleanly", () => {
    setBannerMemory(null);
    setBannerMemory({ title: "no id" });
    expect(getBannerMemory()).toBeNull();

    setBannerMemory({ id: "m1", mediaType: "movie", title: "ok" });
    expect(getBannerMemory()).toMatchObject({ id: "m1", mediaType: "movie" });

    clearBannerMemory();
    expect(getBannerMemory()).toBeNull();
  });
});

function BrowseWatchProbe() {
  const loc = useLocation();
  return (
    <div
      data-testid="browse-watch-route"
      data-pathname={loc.pathname}
      data-autoplay={String(Boolean(loc.state?.autoPlay))}
      data-movie-id={loc.state?.movie?.id || ""}
    />
  );
}

describe("BrowseBanner click and CTA routing", () => {
  it("ignores clicks and Enter on the banner container and opens Details only via More Info", async () => {
    const { container } = renderWithProviders(
      <Routes>
        <Route
          path="/movies"
          element={<BrowseBanner pool={[CARRIED]} loading={false} mediaType="movie" />}
        />
        <Route path="/watch/:id/:slug" element={<BrowseWatchProbe />} />
      </Routes>,
      { route: "/movies" },
    );

    const overview = await screen.findByText(/the banner that was on screen/i);
    const hero = container.querySelector(".hero-container--browse");
    expect(hero).not.toBeNull();
    fireEvent.click(hero);
    fireEvent.click(overview);
    fireEvent.keyDown(hero, { key: "Enter" });
    expect(screen.queryByTestId("browse-watch-route")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^more info$/i }));
    const probe = await screen.findByTestId("browse-watch-route");
    expect(probe).toHaveAttribute("data-pathname", "/watch/tmdb-movie-100/carried-movie");
    expect(probe).toHaveAttribute("data-autoplay", "false");
    expect(probe).toHaveAttribute("data-movie-id", "tmdb-movie-100");
  });

  it("launches playback directly (`state.autoPlay: true`) when BrowseBanner Play is clicked", async () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/movies"
          element={<BrowseBanner pool={[CARRIED]} loading={false} mediaType="movie" />}
        />
        <Route path="/watch/:id/:slug" element={<BrowseWatchProbe />} />
      </Routes>,
      { route: "/movies" },
    );

    await screen.findByText(/the banner that was on screen/i);
    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    const probe = await screen.findByTestId("browse-watch-route");
    expect(probe).toHaveAttribute("data-pathname", "/watch/tmdb-movie-100/carried-movie");
    expect(probe).toHaveAttribute("data-autoplay", "true");
    expect(probe).toHaveAttribute("data-movie-id", "tmdb-movie-100");
  });
});
