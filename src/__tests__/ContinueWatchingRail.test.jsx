import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("keeps rail geometry in CSS instead of inline styles", () => {
    const { container } = render(
      <MemoryRouter>
        <ContinueWatchingRail items={items} />
      </MemoryRouter>
    );

    expect(container.querySelector(".cw-rail")).not.toBeNull();

    // Card width/gap/padding live in rails.css; JS only reports which edges
    // need a fade, so the track must not carry an inline style at all.
    const track = container.querySelector(".cw-rail__track");
    expect(track).not.toBeNull();
    expect(track).toHaveAttribute("data-fade");
    expect(track.getAttribute("style")).toBeNull();

    // The head control is a sized control class, not an ad-hoc utility box.
    expect(screen.getByRole("button", { name: /edit list/i })).toHaveClass("cw-edit-btn");

    // "See all" is translated, not the old hardcoded English default.
    expect(screen.getByText("Show all")).toBeInTheDocument();
  });

  it("does not tuck the lead row under the hero", () => {
    const rails = readFileSync(
      join(process.cwd(), "src", "styles", "rails.css"),
      "utf8"
    );

    // The old blanket `-40px` pull-up cancelled the feed gap for whichever row
    // came first — Continue Watching — leaving its heading flush against the
    // hero. The tuck is fluid now and the lead row opts out.
    expect(rails).not.toContain("margin-top: -40px");
    expect(rails).toContain(".home-rails-section > .home-rails-lead");
    expect(rails).toContain("--rail-stack-gap");
  });
});
