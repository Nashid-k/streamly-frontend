import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { useLocation, Routes, Route } from "react-router-dom";
import useDetailView from "../hooks/useDetailView";
import { renderWithProviders } from "../test/testUtils";

/* Harness: exposes the hook's returns + renders its modal host, exactly
   like a real call site (hero banner, rail card, banner rows) would. */
function Harness({ onReady, movie, sourceElement }) {
  const detail = useDetailView();
  onReady(detail);
  return (
    <div>
      <button onClick={() => detail.openDetails(movie, { sourceElement })}>open</button>
      {detail.modalHost}
      <Routes>
        <Route path="/watch/:id/:slug?" element={<div>details-page</div>} />
      </Routes>
    </div>
  );
}

function LocationProbe({ onLocation }) {
  const location = useLocation();
  onLocation(location.pathname);
  return null;
}

function renderHarness({ movie, detailViewType, reduceMotion, sourceElement } = {}) {
  if (detailViewType) {
    localStorage.setItem("setting-detailViewType", JSON.stringify(detailViewType));
  }
  if (reduceMotion) {
    localStorage.setItem("setting-reduceMotion", JSON.stringify(true));
  }
  const ref = { current: null, pathname: "/" };
  renderWithProviders(
    <>
      <LocationProbe onLocation={(p) => (ref.pathname = p)} />
      <Harness movie={movie} sourceElement={sourceElement} onReady={(d) => (ref.current = d)} />
    </>,
  );
  return ref;
}

const baseMovie = {
  id: "movie-123",
  title: "Test Movie",
  overview: "A test story.",
};

function makePoster() {
  const poster = document.createElement("img");
  document.body.appendChild(poster);
  return poster;
}

describe("useDetailView", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  afterEach(() => {
    delete document.startViewTransition;
    document.documentElement.removeAttribute("data-poster-morph");
    document.querySelectorAll("img").forEach((el) => el.remove());
  });

  it("opens the info modal when Detail View Type = modal", async () => {
    const ref = renderHarness({ movie: baseMovie, detailViewType: "modal" });
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(ref.current.isModalOpen).toBe(true));
    expect(screen.getByTestId("title-info-modal")).toBeInTheDocument();
    expect(ref.pathname).toBe("/");
  });

  it("navigates to the details page when Detail View Type = page", async () => {
    const ref = renderHarness({ movie: baseMovie, detailViewType: "page" });
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(ref.pathname).toBe("/watch/movie-123/test-movie"));
    expect(ref.current.isModalOpen).toBe(false);
    expect(screen.queryByTestId("title-info-modal")).not.toBeInTheDocument();
  });

  it("morphs the supplied poster into the detail hero and clears the handoff", async () => {
    const poster = makePoster();
    let resolveFinished;
    const finished = new Promise((resolve) => {
      resolveFinished = resolve;
    });
    document.startViewTransition = vi.fn((commit) => {
      commit();
      return { finished };
    });

    const ref = renderHarness({ movie: baseMovie, detailViewType: "page", sourceElement: poster });
    fireEvent.click(screen.getByText("open"));

    await waitFor(() => expect(ref.pathname).toBe("/watch/movie-123/test-movie"));
    expect(document.startViewTransition).toHaveBeenCalledTimes(1);
    expect(poster.style.viewTransitionName).toBe("streamly-poster");
    expect(document.documentElement.getAttribute("data-poster-morph")).toBe("true");

    resolveFinished();
    await waitFor(() => expect(poster.style.viewTransitionName).toBe(""));
    expect(document.documentElement.hasAttribute("data-poster-morph")).toBe(false);
  });

  it("skips the view transition when the in-app reduced-motion preference is on", async () => {
    const poster = makePoster();
    document.startViewTransition = vi.fn((commit) => {
      commit();
      return { finished: Promise.resolve() };
    });

    const ref = renderHarness({
      movie: baseMovie,
      detailViewType: "page",
      reduceMotion: true,
      sourceElement: poster,
    });
    fireEvent.click(screen.getByText("open"));

    await waitFor(() => expect(ref.pathname).toBe("/watch/movie-123/test-movie"));
    expect(document.startViewTransition).not.toHaveBeenCalled();
    expect(poster.style.viewTransitionName).toBe("");
    expect(document.documentElement.hasAttribute("data-poster-morph")).toBe(false);
  });

  it("exposes the modal host only while a movie is open", async () => {
    const ref = renderHarness({ movie: baseMovie, detailViewType: "modal" });
    expect(ref.current.modalHost).toBeNull();
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(ref.current.modalHost).not.toBeNull());
    // close through the gateway
    ref.current.closeDetails();
    await waitFor(() => expect(ref.current.isModalOpen).toBe(false));
  });

  it("forceModal opens the info modal even when Detail View Type = page", async () => {
    const ref = renderHarness({ movie: baseMovie, detailViewType: "page" });
    ref.current.openDetails(baseMovie, { forceModal: true });
    await waitFor(() => expect(ref.current.isModalOpen).toBe(true));
    expect(screen.getByTestId("title-info-modal")).toBeInTheDocument();
    expect(ref.pathname).toBe("/");
  });

  it("ignores empty movie calls", () => {
    const ref = renderHarness({ movie: null, detailViewType: "modal" });
    ref.current.openDetails(null);
    expect(ref.current.isModalOpen).toBe(false);
  });
});
