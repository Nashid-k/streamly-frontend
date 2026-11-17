import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MovieRail from "../components/rails/MovieRail";

const refreshRail = vi.hoisted(() => vi.fn());

vi.mock("../components/MovieCard", () => ({
  default: ({ movie }) => <div>{movie.title}</div>,
}));
vi.mock("../components/RailArrow", () => ({ default: () => null }));
vi.mock("../components/rails/SectionHeader", () => ({
  default: ({ title }) => <div>{title}</div>,
}));
vi.mock("../hooks/useRailArrows", () => ({
  default: () => ({ canScrollLeft: false, canScrollRight: false, refresh: refreshRail }),
}));

describe("MovieRail keyboard accessibility", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback) {
          this.callback = callback;
        }
        observe(target) {
          this.callback([{ isIntersecting: true, target }]);
        }
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves scroll measurements to the hook's animation-frame scheduler", async () => {
    refreshRail.mockClear();
    render(
      <MovieRail
        category={{
          name: "Trending Movies",
          movies: [{ id: "movie-1", title: "Arrival" }],
        }}
      />,
    );

    const track = await screen.findByRole("group", {
      name: "Trending Movies titles",
    });
    fireEvent.scroll(track);

    expect(refreshRail).not.toHaveBeenCalled();
  });

  it("exposes the horizontal track as a labelled keyboard-focusable group", async () => {
    render(
      <MovieRail
        category={{
          name: "Trending Movies",
          movies: [{ id: "movie-1", title: "Arrival" }],
        }}
      />,
    );

    const track = await screen.findByRole("group", {
      name: "Trending Movies titles",
    });

    await waitFor(() => expect(track).toHaveAttribute("tabindex", "0"));
    expect(track).toContainElement(screen.getByText("Arrival"));
  });
});
