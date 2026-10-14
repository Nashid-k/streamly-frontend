import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { Routes, Route, useLocation } from "react-router-dom";
import NotFoundPage from "../pages/NotFoundPage";
import { renderWithProviders } from "../test/testUtils";

/* The catch-all recovery surface. An unmatched <Routes> used to render a blank
   screen, so these pin the two things that must survive: the page is honest
   about being a 404, and a lost visitor can get somewhere useful again. */

if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc">{`${pathname}${search}`}</div>;
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="*" element={<NotFoundPage />} />
      <Route path="/" element={<div>HOME</div>} />
      <Route path="/search" element={<LocationProbe />} />
    </Routes>,
    { route: "/does-not-exist" },
  );
}

describe("NotFoundPage", () => {
  it("shows a 404 with both recovery actions", () => {
    renderPage();
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go home/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();
  });

  it("sends a search from the 404 field to /search?q=", async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/search movies/i), {
      target: { value: "dune" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
    expect(await screen.findByTestId("loc")).toHaveTextContent("/search?q=dune");
  });

  it("falls back to Home when there is no history to go back to", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(await screen.findByText("HOME")).toBeInTheDocument();
  });
});
