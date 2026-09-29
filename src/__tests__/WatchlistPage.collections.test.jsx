import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WatchlistPage from "../pages/WatchlistPage";
import { AppContext } from "../context/auth";
import { ToastProvider } from "../components/Toast.jsx";

/* Two additions to this page, both verified here because neither had a
   consumer before: the "Best Collections" rail (i18n keys existed, the rail
   never mounted) and the copy-public-link action (WatchlistPage had no
   clipboard call at all). */

const publicCollection = {
  id: "c-pub",
  name: "Party Picks",
  itemIds: ["m1", "m2"],
  visibility: "public",
  publicId: "pub42",
  createdAt: 1,
  updatedAt: 2,
};
const privateCollection = {
  id: "c-priv",
  name: "Secret Queue",
  itemIds: ["m3"],
  visibility: "private",
  createdAt: 3,
  updatedAt: 4,
};

let writeText;

function renderPage() {
  const value = {
    user: { googleId: "g-1" },
    myList: [],
    collections: [privateCollection, publicCollection],
    publicCollections: [publicCollection],
    searchHistory: [],
    addSearch: vi.fn(),
    clearSearchHistory: vi.fn(),
    isInList: () => false,
    toggleMyList: vi.fn(),
    addNotification: vi.fn(),
    removeBatchFromMyList: vi.fn(),
    createCollection: vi.fn(),
    createCollectionWithItems: vi.fn(),
    renameCollection: vi.fn(),
    deleteCollection: vi.fn(),
    addToCollection: vi.fn(),
    removeFromCollection: vi.fn(),
    toggleInCollection: vi.fn(),
    setCollectionVisibility: vi.fn(),
  };
  return render(
    <AppContext.Provider value={value}>
      <MemoryRouter initialEntries={["/watchlist"]}>
        <ToastProvider>
          <WatchlistPage />
        </ToastProvider>
      </MemoryRouter>
    </AppContext.Provider>,
  );
}

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

describe("WatchlistPage Best Collections rail", () => {
  it("mounts the rail with its title and hint when a public list exists", () => {
    renderPage();

    expect(screen.getByText("Best Collections")).toBeInTheDocument();
    expect(
      screen.getByText("Your most-loved lists, surfaced without any username"),
    ).toBeInTheDocument();
  });

  it("ranks public lists by size and leaves private ones out", () => {
    renderPage();

    const rail = screen.getByText("Best Collections").closest("section");
    expect(rail).toBeTruthy();
    expect(rail.textContent).toContain("Party Picks");
    expect(rail.textContent).not.toContain("Secret Queue");
  });

  it("stays hidden when nothing is public", () => {
    const value = {
      collections: [privateCollection],
      publicCollections: [],
    };
    render(
      <AppContext.Provider
        value={{
          user: null,
          myList: [],
          searchHistory: [],
          isInList: () => false,
          toggleMyList: vi.fn(),
          ...value,
        }}
      >
        <MemoryRouter initialEntries={["/watchlist"]}>
          <ToastProvider>
            <WatchlistPage />
          </ToastProvider>
        </MemoryRouter>
      </AppContext.Provider>,
    );

    expect(screen.queryByText("Best Collections")).not.toBeInTheDocument();
    // The full list is still there — only the highlight strip is conditional.
    expect(screen.getByText("Secret Queue")).toBeInTheDocument();
  });
});

describe("WatchlistPage copy public link", () => {
  it("offers copy only on public collections", () => {
    renderPage();

    const copyButtons = screen.getAllByRole("button", {
      name: /copy public link/i,
    });
    expect(copyButtons.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /copy public link — Secret Queue/i })).toBeNull();
  });

  it("copies the opaque /collections/:publicId URL", async () => {
    renderPage();

    const copyButtons = screen.getAllByRole("button", {
      name: /copy public link — Party Picks/i,
    });
    fireEvent.click(copyButtons[0]);

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/collections/pub42`,
    );
  });
});
