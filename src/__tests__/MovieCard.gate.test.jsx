import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import MovieCard from "../components/MovieCard";
import { renderWithProviders } from "../test/testUtils";

/* The card's list button is the most-reached gated action in the product — one
   component instance per title in every rail. Two things must hold: a refused
   write leaves localStorage untouched and announces nothing, and a real write
   still toasts and posts its "added" notification. */

const MOVIE = {
  id: "movie-550",
  title: "Fight Club",
  releaseYear: "1999",
  posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
  backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
  isSeries: false,
};

function renderCard({ notifications = true } = {}) {
  const addNotification = notifications ? vi.fn() : undefined;
  const utils = renderWithProviders(<MovieCard movie={MOVIE} />, {
    route: "/",
    authValue: {
      user: null,
      isAuthenticated: false,
      hasAccount: false,
      myList: [],
      toggleMyList: () => false,
      isInList: () => false,
      addNotification,
      signIn: { open: false, mode: "signin", reason: "" },
      openSignIn: vi.fn(),
      closeSignIn: vi.fn(),
      requireAuth: () => true,
      syncStatus: "idle",
    },
  });
  return { ...utils, addNotification };
}

describe("MovieCard list toggle", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows nothing saved when the gate refuses, and no success toast", async () => {
    const { addNotification } = renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /my list/i }));

    // toggleMyList returned false => the gate opened sign-in instead.
    expect(addNotification).not.toHaveBeenCalled();
    expect(screen.queryByText(/saved to your list/i)).toBeNull();
    expect(screen.queryByText(/added to my list/i)).toBeNull();
  });

  it("reports the save when the mutator actually ran", async () => {
    // Same component, but through the real provider with a session, so the
    // underlying hook performs a genuine write.
    localStorage.setItem(
      "streamly_user",
      JSON.stringify({ id: "acc-1", accountId: "acc-1", name: "T", email: "t@streamly.io" })
    );
    renderWithProviders(<MovieCard movie={MOVIE} />, { route: "/" });

    fireEvent.click(await screen.findByRole("button", { name: /my list/i }));

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("aios_my_list") || "[]");
      expect(stored.map((m) => m.id)).toContain("movie-550");
    });
    expect(await screen.findByText(/saved to your list/i)).toBeInTheDocument();
  });
});