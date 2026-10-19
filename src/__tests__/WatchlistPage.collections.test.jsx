import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import WatchlistPage from "../pages/WatchlistPage";
import { renderWithProviders } from "../test/testUtils";

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
  return renderWithProviders(<WatchlistPage />, {
    route: "/watchlist",
    // A raw context value mounts AppContext.Provider directly — a synthetic
    // session with NO AuthProvider sync/network side effects.
    authValue: {
      user: { accountId: "acc-1", email: "watcher@test.com" },
      // Collections count only ids that resolve to a live My List entry, so the
      // fixtures below must actually exist in the list.
      myList: [
        { id: "m1", title: "One" },
        { id: "m2", title: "Two" },
        { id: "m3", title: "Three" },
      ],
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
    },
  });
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
    renderWithProviders(<WatchlistPage />, {
      route: "/watchlist",
      authValue: {
        user: null,
        myList: [],
        searchHistory: [],
        isInList: () => false,
        toggleMyList: vi.fn(),
        collections: [privateCollection],
        publicCollections: [],
      },
    });

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

/* A collection stores itemIds that point at aios_my_list entries, but removing
   a title from My List tombstones JUST the my_list copy — the id is orphaned in
   every collection it belonged to. Counts and the empty state must read the
   live intersection (what the grid renders), not the stored array. */
describe("WatchlistPage collection counts ignore orphaned ids", () => {
  function renderStale({ collection, myList }) {
    return renderWithProviders(<WatchlistPage />, {
      route: "/watchlist",
      authValue: {
        user: { accountId: "acc-1", email: "watcher@test.com" },
        myList,
        collections: [collection],
        publicCollections: [],
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
      },
    });
  }

  it("shows only the ids that still resolve to My List entries", () => {
    renderStale({
      myList: [{ id: "m1", title: "Live One" }],
      collection: {
        id: "c-stale",
        name: "Stale",
        itemIds: ["m1", "gone-1", "gone-2"],
        visibility: "private",
        createdAt: 1,
        updatedAt: 2,
      },
    });

    expect(screen.getByText("1 title")).toBeInTheDocument();
    expect(screen.queryByText("3 titles")).toBeNull();
  });

  it("shows the collection empty state when every id is orphaned", () => {
    renderStale({
      myList: [{ id: "m1", title: "Live One" }],
      collection: {
        id: "c-orphans",
        name: "Orphans",
        itemIds: ["gone-1", "gone-2"],
        visibility: "private",
        createdAt: 1,
        updatedAt: 2,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /open collection orphans/i }));

    // Not the "No items match this filter" fallback — the collection is genuinely empty.
    expect(screen.getByText("This collection is empty")).toBeInTheDocument();
  });
});
