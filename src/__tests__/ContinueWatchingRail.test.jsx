import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ContinueWatchingRail from "../components/ContinueWatchingRail";

const mockRemove = vi.fn();
vi.mock("../context/auth", () => ({
  useAppAuth: () => ({
    removeFromContinueWatching: mockRemove,
  }),
}));

describe("ContinueWatchingRail", () => {
  const items = [
    {
      id: "movie-1108427",
      title: "Moana",
      backdropUrl: "https://image.tmdb.org/t/p/w780/bmzkFxTZGHW4BlKL6kLm7TDyW4f.jpg",
      timestamp: 120,
      duration: 6900,
    },
    {
      id: "tv-12345",
      title: "Breaking Bad",
      backdropUrl: "https://image.tmdb.org/t/p/w780/test.jpg",
      savedSeason: 2,
      savedEpisode: 4,
      isSeries: true,
      timestamp: 600,
      duration: 3000,
    },
  ];

  it("renders Continue Watching header, items, and formatted remaining time", () => {
    render(
      <MemoryRouter>
        <ContinueWatchingRail items={items} />
      </MemoryRouter>
    );

    expect(screen.getByText("Continue Watching")).toBeInTheDocument();
    // Title / progress strings intentionally repeat in the desktop hover
    // preview panel, so assert presence via getAllByText.
    expect(screen.getAllByText("Moana")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Breaking Bad")[0]).toBeInTheDocument();
    expect(screen.getAllByText("S2:E4")[0]).toBeInTheDocument();
    expect(screen.getAllByText("1hr 53m left")[0]).toBeInTheDocument();
    expect(screen.getAllByText("40m left")[0]).toBeInTheDocument();
  });

  it("toggles edit mode and allows removing items", () => {
    render(
      <MemoryRouter>
        <ContinueWatchingRail items={items} />
      </MemoryRouter>
    );

    const editBtn = screen.getByRole("button", { name: /edit list/i });
    fireEvent.click(editBtn);

    expect(screen.getByText("Done")).toBeInTheDocument();

    const removeBtn = screen.getByRole("button", { name: /remove moana/i });
    expect(removeBtn).toBeInTheDocument();
    fireEvent.click(removeBtn);

    expect(mockRemove).toHaveBeenCalledWith("movie-1108427");
  });

  it("returns null if items array is empty", () => {
    const { container } = render(
      <MemoryRouter>
        <ContinueWatchingRail items={[]} />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });
});
