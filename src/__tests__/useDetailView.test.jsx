import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import useDetailView from "../hooks/useDetailView";
import { PreferencesProvider } from "../context/PreferencesContext";
import { ToastProvider } from "../components/Toast";
import { AuthProvider } from "../context/AuthContext";

/* Harness: exposes the hook's returns + renders its modal host, exactly
   like a real call site (hero banner, rail card, banner rows) would. */
function Harness({ onReady, movie }) {
  const detail = useDetailView();
  onReady(detail);
  return (
    <div>
      <button onClick={() => detail.openDetails(movie)}>open</button>
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

function renderHarness({ movie, detailViewType } = {}) {
  if (detailViewType) {
    localStorage.setItem("setting-detailViewType", JSON.stringify(detailViewType));
  }
  const ref = { current: null, pathname: "/" };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <PreferencesProvider>
              <LocationProbe onLocation={(p) => (ref.pathname = p)} />
              <Harness movie={movie} onReady={(d) => (ref.current = d)} />
            </PreferencesProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return ref;
}

const baseMovie = {
  id: "movie-123",
  title: "Test Movie",
  overview: "A test story.",
};

describe("useDetailView", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
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

  it("exposes the modal host only while a movie is open", async () => {
    const ref = renderHarness({ movie: baseMovie, detailViewType: "modal" });
    expect(ref.current.modalHost).toBeNull();
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(ref.current.modalHost).not.toBeNull());
    // close through the gateway
    ref.current.closeDetails();
    await waitFor(() => expect(ref.current.isModalOpen).toBe(false));
  });

  it("ignores empty movie calls", () => {
    const ref = renderHarness({ movie: null, detailViewType: "modal" });
    ref.current.openDetails(null);
    expect(ref.current.isModalOpen).toBe(false);
  });
});
