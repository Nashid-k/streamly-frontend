import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { useLocation, Routes, Route } from "react-router-dom";
import useDetailView, {
  useDetailBack,
  getDetailTransitionSnapshot,
} from "../hooks/useDetailView";
import { renderWithProviders } from "../test/testUtils";

/* Harness: exposes the hook's returns + renders its modal host, exactly
   like a real call site (hero banner, rail card, banner rows) would. */
function Harness({ onReady, movie, sourceElement }) {
  const detail = useDetailView();
  const detailBack = useDetailBack();
  onReady(detail);
  return (
    <div>
      <button onClick={() => detail.openDetails(movie, { sourceElement })}>open</button>
      <button onClick={detailBack}>back</button>
      {detail.modalHost}
      <Routes>
        <Route path="/" element={<div>home-page</div>} />
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
  backdropUrl: "/backdrop.jpg",
};

function makePoster() {
  const rail = document.createElement("div");
  rail.dataset.detailRail = "Trending";
  rail.setAttribute("role", "group");
  rail.scrollLeft = 120;
  const poster = document.createElement("img");
  poster.dataset.detailSource = baseMovie.id;
  poster.dataset.detailToken = "Trending:0:movie-123";
  rail.appendChild(poster);
  document.body.appendChild(rail);
  return poster;
}

function stubViewTransitions(onCapture) {
  document.startViewTransition = vi.fn((commit) => {
    onCapture?.();
    commit();
    return { finished: Promise.resolve() };
  });
}

describe("useDetailView", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    /* Short but nonzero: the first View Transition commits synchronously in
       these stubs, so B can be observed before the hold timer advances. */
    document.documentElement.style.setProperty("--detail-b-duration", "20ms");
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Object.defineProperty(window, "scrollY", { configurable: true, value: 432 });
  });

  afterEach(() => {
    delete document.startViewTransition;
    document.documentElement.style.removeProperty("--detail-b-duration");
    document.documentElement.removeAttribute("data-poster-morph");
    document.documentElement.removeAttribute("data-detail-transition");
    document.documentElement.removeAttribute("data-route-animating");
    document.querySelectorAll("img").forEach((el) => el.remove());
    document.querySelectorAll("[data-detail-rail]").forEach((el) => el.remove());
    delete window.__streamlyDetailScrollRestored;
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    vi.restoreAllMocks();
  });

  it("opens the info modal when Detail View Type = modal", async () => {
    const ref = renderHarness({ movie: baseMovie, detailViewType: "modal" });
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(ref.current.isModalOpen).toBe(true));
    expect(screen.getByTestId("title-info-modal")).toBeInTheDocument();
    expect(ref.pathname).toBe("/");
  });

  it("captures the exact card token and rail/page geometry on A→B→C", async () => {
    const poster = makePoster();
    let sourceNameAtCapture = "";
    stubViewTransitions(() => {
      sourceNameAtCapture = poster.style.viewTransitionName;
    });

    const ref = renderHarness({ movie: baseMovie, detailViewType: "page", sourceElement: poster });
    fireEvent.click(screen.getByText("open"));

    const session = getDetailTransitionSnapshot().session;
    expect(sourceNameAtCapture).toBe("streamly-poster");
    expect(getDetailTransitionSnapshot().overlay).toBe(true);
    expect(session.sourceId).toBe(baseMovie.id);
    expect(session.detailToken).toBe("Trending:0:movie-123");
    expect(session.scrollY).toBe(432);
    expect(session.railKey).toBe("Trending");
    expect(session.railScrollLeft).toBe(120);
    expect(session.rails.Trending).toBe(120);
    expect(session.hasBackdrop).toBe(true);
    expect(poster.style.viewTransitionName).toBe("");
    expect(document.documentElement.dataset.detailTransition).toBe("B");

    await waitFor(() => expect(ref.pathname).toBe("/watch/movie-123/test-movie"));
    await waitFor(() => expect(getDetailTransitionSnapshot().overlay).toBe(false));
    await waitFor(() => expect(getDetailTransitionSnapshot().bypass).toBe(false));

    expect(document.startViewTransition).toHaveBeenCalledTimes(2);
    expect(getDetailTransitionSnapshot().bypass).toBe(false);
    expect(poster.style.viewTransitionName).toBe("");
    expect(document.documentElement.hasAttribute("data-poster-morph")).toBe(false);
    expect(document.documentElement.hasAttribute("data-detail-transition")).toBe(false);
  });

  it("restores the original card and rail/page geometry on C→B→A", async () => {
    const poster = makePoster();
    stubViewTransitions();

    const ref = renderHarness({ movie: baseMovie, detailViewType: "page", sourceElement: poster });
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(ref.pathname).toBe("/watch/movie-123/test-movie"));
    await waitFor(() => expect(getDetailTransitionSnapshot().overlay).toBe(false));
    await waitFor(() => expect(getDetailTransitionSnapshot().bypass).toBe(false));

    fireEvent.click(screen.getByText("back"));
    expect(getDetailTransitionSnapshot().overlay).toBe(true);
    expect(document.documentElement.dataset.detailTransition).toBe("B");

    await waitFor(() => expect(ref.pathname).toBe("/"));
    await waitFor(() => expect(getDetailTransitionSnapshot().overlay).toBe(false));
    await waitFor(() => expect(getDetailTransitionSnapshot().bypass).toBe(false));

    expect(document.startViewTransition).toHaveBeenCalledTimes(4);
    expect(poster.parentElement.scrollLeft).toBe(120);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 432, left: 0, behavior: "instant" });
    expect(window.__streamlyDetailScrollRestored).toBe(true);
    expect(poster.style.viewTransitionName).toBe("");
  });

  it("skips the view transitions when the in-app reduced-motion preference is on", async () => {
    const poster = makePoster();
    stubViewTransitions();

    const ref = renderHarness({
      movie: baseMovie,
      detailViewType: "page",
      reduceMotion: true,
      sourceElement: poster,
    });
    fireEvent.click(screen.getByText("open"));

    await waitFor(() => expect(ref.pathname).toBe("/watch/movie-123/test-movie"));
    expect(document.startViewTransition).not.toHaveBeenCalled();
    expect(getDetailTransitionSnapshot().overlay).toBe(false);
    expect(poster.style.viewTransitionName).toBe("");
  });

  it("exposes the modal host only while a movie is open", async () => {
    const ref = renderHarness({ movie: baseMovie, detailViewType: "modal" });
    expect(ref.current.modalHost).toBeNull();
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(ref.current.modalHost).not.toBeNull());
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
