import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/testUtils";
import { useTitleLogo } from "../hooks/useTitleLogo";

/* The one logo rule shared by the home hero, the details hero and the player's
   cold-open stage. The regression this pins: a title TMDB has no logo for used
   to get its poster/backdrop preview drawn in the logo slot, and a logo lookup
   was never attempted outside the home hero. */

const mocks = vi.hoisted(() => ({ getTitleLogo: vi.fn() }));

vi.mock("../api/movieService", () => ({
  movieService: { getTitleLogo: mocks.getTitleLogo },
}));

function LogoProbe({ movie }) {
  const { logoUrl, onLogoError } = useTitleLogo(movie, "TestLogo");
  return (
    <>
      <output data-testid="logo">{logoUrl || "none"}</output>
      <button type="button" onClick={onLogoError}>
        break the art
      </button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.getTitleLogo.mockReset();
});

describe("useTitleLogo", () => {
  it("draws the details logo without re-looking it up", () => {
    renderWithProviders(
      <LogoProbe movie={{ id: "movie-1", title: "One", logoUrl: "https://img.test/one.png" }} />,
    );

    expect(screen.getByTestId("logo")).toHaveTextContent("https://img.test/one.png");
    expect(mocks.getTitleLogo).not.toHaveBeenCalled();
  });

  it("finds a logo for a title whose details payload carries none", async () => {
    mocks.getTitleLogo.mockResolvedValue("https://img.test/found.png");

    renderWithProviders(<LogoProbe movie={{ id: "movie-2", title: "Two" }} />);

    // The text fallback holds until the lookup answers (no poster art stands in).
    expect(screen.getByTestId("logo")).toHaveTextContent("none");
    await waitFor(() =>
      expect(screen.getByTestId("logo")).toHaveTextContent("https://img.test/found.png"),
    );
    expect(mocks.getTitleLogo).toHaveBeenCalledWith("movie-2");
  });

  it("stays on the text fallback when TMDB has no logo either", async () => {
    mocks.getTitleLogo.mockResolvedValue(null);

    renderWithProviders(<LogoProbe movie={{ id: "movie-3", title: "Three" }} />);

    await waitFor(() => expect(mocks.getTitleLogo).toHaveBeenCalledWith("movie-3"));
    expect(screen.getByTestId("logo")).toHaveTextContent("none");
  });

  it("drops to the text fallback when the logo file fails to decode", () => {
    renderWithProviders(
      <LogoProbe movie={{ id: "movie-4", title: "Four", logoUrl: "https://img.test/broken.png" }} />,
    );

    fireEvent.click(screen.getByText("break the art"));

    expect(screen.getByTestId("logo")).toHaveTextContent("none");
  });

  it("honours the image-logos preference without spending a lookup", () => {
    localStorage.setItem("setting-useImageLogos", JSON.stringify(false));

    renderWithProviders(
      <LogoProbe movie={{ id: "movie-5", title: "Five", logoUrl: "https://img.test/five.png" }} />,
    );

    expect(screen.getByTestId("logo")).toHaveTextContent("none");
    expect(mocks.getTitleLogo).not.toHaveBeenCalled();
  });
});
