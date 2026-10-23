import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import WatchlistPage from "../pages/WatchlistPage";
import HistoryPage from "../pages/HistoryPage";
import { renderWithProviders } from "../test/testUtils";

/* Two destructive-action contracts, both verified here because both failed:
 *
 *   1. A SELECTION is a statement about the rows on screen. Changing the
 *      filter (or the search) changes those rows, so the selection must go with
 *      them. It used to survive: select 3 rows, pick a different Type, and the
 *      grid showed nothing selected while the bar still said "3 selected" — and
 *      Delete then removed 3 rows that were no longer visible, including titles
 *      the viewer had never seen.
 *
 *   2. A bulk Delete inside a COLLECTION means "take these out of this
 *      collection" — exactly what the per-card ✕ on the same rows does. The
 *      bulk path used to always call removeBatchFromMyList, which tombstones
 *      the My List entry, so tidying a collection silently destroyed the
 *      user's My List as well. */

const MY_LIST = [
  { id: "m1", title: "Alpha", isSeries: false, mediaType: "movie", releaseYear: 2020 },
  { id: "m2", title: "Bravo", isSeries: true, mediaType: "tv", releaseYear: 2021 },
  { id: "m3", title: "Charlie", isSeries: false, mediaType: "movie", releaseYear: 2022 },
];

const COLLECTION = {
  id: "c1",
  name: "Weekend Queue",
  itemIds: ["m1", "m2"],
  visibility: "private",
  createdAt: 1,
  updatedAt: 2,
};

function authValue(overrides = {}) {
  return {
    user: { accountId: "acc-1", email: "watcher@test.com" },
    myList: MY_LIST,
    collections: [COLLECTION],
    publicCollections: [],
    searchHistory: [],
    addSearch: vi.fn(),
    clearSearchHistory: vi.fn(),
    isInList: () => false,
    toggleMyList: vi.fn(),
    addNotification: vi.fn(),
    removeBatchFromMyList: vi.fn(),
    removeBatchFromCollection: vi.fn(),
    createCollection: vi.fn(),
    createCollectionWithItems: vi.fn(),
    renameCollection: vi.fn(),
    deleteCollection: vi.fn(),
    addToCollection: vi.fn(),
    removeFromCollection: vi.fn(),
    toggleInCollection: vi.fn(),
    setCollectionVisibility: vi.fn(),
    continueWatching: MY_LIST,
    removeFromContinueWatching: vi.fn(),
    removeBatchFromContinueWatching: vi.fn(),
    clearContinueWatching: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* The bulk bar reports the selection count. WatchlistPage renders it as
   "Delete (N)"; HistoryPage as "N selected". Read the number, not the button. */
const selectedCount = () => {
  const body = document.body.textContent || "";
  const deleteMatch = body.match(/Delete \((\d+)\)/);
  if (deleteMatch) return Number(deleteMatch[1]);
  const selectedMatch = body.match(/(\d+)\s+selected/);
  return selectedMatch ? Number(selectedMatch[1]) : 0;
};

describe("WatchlistPage selection follows the visible rows", () => {
  it("drops the selection when the Type filter changes", async () => {
    renderWithProviders(<WatchlistPage />, {
      route: "/watchlist",
      authValue: authValue(),
    });

    // Enter select mode and take everything on screen.
    fireEvent.click(screen.getByRole("button", { name: "Enter select mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all visible" }));
    expect(selectedCount()).toBe(3);

    // Now change the Type filter — the rows on screen are different titles.
    fireEvent.click(screen.getByRole("button", { name: "Filter by All" }));
    fireEvent.click(screen.getByRole("option", { name: "TV Shows" }));

    // The stale selection must be gone, or Delete would remove off-screen rows.
    expect(selectedCount()).toBe(0);
  });
});

describe("WatchlistPage bulk delete inside a collection", () => {
  it("removes the titles from the collection and leaves My List alone", () => {
    const removeBatchFromCollection = vi.fn();
    const removeBatchFromMyList = vi.fn();

    renderWithProviders(<WatchlistPage />, {
      route: "/watchlist",
      authValue: authValue({ removeBatchFromCollection, removeBatchFromMyList }),
    });

    // Open the collection.
    fireEvent.click(screen.getByRole("button", { name: "Open collection Weekend Queue" }));

    // Select everything on screen and delete.
    fireEvent.click(screen.getByRole("button", { name: "Enter select mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all visible" }));
    const del = screen.getByRole("button", { name: /delete \(\d+\)/i });
    fireEvent.click(del);

    // The collection lost the titles; My List did NOT.
    expect(removeBatchFromCollection).toHaveBeenCalled();
    expect(removeBatchFromCollection.mock.calls[0][0]).toBe("c1");
    expect(removeBatchFromMyList).not.toHaveBeenCalled();
  });
});

describe("HistoryPage selection follows the visible rows", () => {
  it("drops the selection when the search changes", async () => {
    renderWithProviders(<HistoryPage />, {
      route: "/history",
      authValue: authValue(),
    });

    // Enter select mode and take everything on screen.
    fireEvent.click(screen.getByRole("button", { name: /^select$/i }));
    fireEvent.click(screen.getByRole("button", { name: /select all/i }));
    expect(selectedCount()).toBeGreaterThan(0);

    // A new search changes the rows on screen.
    fireEvent.change(screen.getByPlaceholderText(/search watch history/i), {
      target: { value: "al" },
    });

    expect(selectedCount()).toBe(0);
  });
});
