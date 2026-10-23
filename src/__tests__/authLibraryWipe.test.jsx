import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AuthProvider } from "../context/AuthContext";
import { useAppAuth } from "../context/auth";
import { useMyList, useContinueWatching, useMyCollections } from "../hooks/useUserData";

/* Sign-out on a shared machine must leave NOTHING of the previous account
   readable — not just in localStorage, but ON SCREEN.

   The wipe already existed: `discardLocalLibrary()` removes the three synced
   keys and announces it. But the announcement was a plain event, and the list
   readers MERGE incoming rows with the ones they already hold
   (mergeListsById is a timestamp-aware union that starts from the current
   state). A union with an empty list is a no-op, so the wipe changed the
   storage and left the previous account's watchlist, watch history and
   collection NAMES rendered until a full page reload.

   The existing auth test asserted only localStorage, so it passed while the
   UI leaked. These tests assert the rendered result. */

function LibraryConsumer() {
  const { user, logout } = useAppAuth();
  const { myList } = useMyList();
  const { continueWatching } = useContinueWatching();
  const { collections } = useMyCollections();
  return (
    <div>
      <span data-testid="user-name">{user?.name || "none"}</span>
      <span data-testid="my-list">{myList.map((m) => m.title).join(",") || "empty"}</span>
      <span data-testid="watch-history">
        {continueWatching.map((m) => m.title).join(",") || "empty"}
      </span>
      <span data-testid="collections">
        {collections.map((c) => c.name).join(",") || "empty"}
      </span>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

function jsonResponse(body, ok = true) {
  return { ok, status: ok ? 200 : 401, json: async () => body };
}

describe("sign-out clears the RENDERED library, not just the stored one", () => {
  let fetchSpy;

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ success: false }));
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empties the watchlist, history and collections on screen", async () => {
    // A signed-in account with a populated library.
    localStorage.setItem(
      "streamly_user",
      JSON.stringify({ id: "acc-1", accountId: "acc-1", name: "Alex", email: "alex@test.com" }),
    );
    localStorage.setItem(
      "aios_my_list",
      JSON.stringify([{ id: 11, title: "Private Film", updatedAt: 1 }]),
    );
    localStorage.setItem(
      "aios_continue_watching",
      JSON.stringify([{ id: 22, title: "Secret Show", lastWatched: 1, updatedAt: 1 }]),
    );
    localStorage.setItem(
      "aios_my_collections",
      JSON.stringify([{ id: "c1", name: "Alex's Picks", itemIds: [], updatedAt: 1 }]),
    );

    render(
      <AuthProvider>
        <LibraryConsumer />
      </AuthProvider>,
    );

    // The library is on screen before the sign-out.
    expect(screen.getByTestId("my-list")).toHaveTextContent("Private Film");
    expect(screen.getByTestId("watch-history")).toHaveTextContent("Secret Show");
    expect(screen.getByTestId("collections")).toHaveTextContent("Alex's Picks");

    await act(async () => {
      screen.getByText("Logout").click();
    });

    // The next person at this machine must not see any of it.
    expect(screen.getByTestId("user-name")).toHaveTextContent("none");
    expect(screen.getByTestId("my-list")).toHaveTextContent("empty");
    expect(screen.getByTestId("watch-history")).toHaveTextContent("empty");
    expect(screen.getByTestId("collections")).toHaveTextContent("empty");
  });

  it("empties the rendered library when a DIFFERENT account is adopted", async () => {
    // A guest browsed and left rows behind, then a real account signs in. The
    // guest's rows must not survive on screen under the new account.
    localStorage.setItem("aios_my_list", JSON.stringify([{ id: 31, title: "Guest Film", updatedAt: 1 }]));
    localStorage.setItem(
      "aios_continue_watching",
      JSON.stringify([{ id: 32, title: "Guest Show", lastWatched: 1, updatedAt: 1 }]),
    );

    fetchSpy.mockResolvedValue(
      jsonResponse({
        success: true,
        user: { id: "acc-9", accountId: "acc-9", name: "New", email: "new@test.com" },
        syncToken: "tok-9",
        userData: { watchlist: [], watchHistory: [], collections: [] },
      }),
    );

    function SignInConsumer() {
      const { loginWithEmail } = useAppAuth();
      const { myList } = useMyList();
      const { continueWatching } = useContinueWatching();
      return (
        <div>
          <span data-testid="my-list">{myList.map((m) => m.title).join(",") || "empty"}</span>
          <span data-testid="watch-history">
            {continueWatching.map((m) => m.title).join(",") || "empty"}
          </span>
          <button
            onClick={() => loginWithEmail({ email: "new@test.com", password: "pw pw pw" })}
          >
            Login Email
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <SignInConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId("my-list")).toHaveTextContent("Guest Film");

    await act(async () => {
      screen.getByText("Login Email").click();
    });

    expect(screen.getByTestId("my-list")).toHaveTextContent("empty");
    expect(screen.getByTestId("watch-history")).toHaveTextContent("empty");
  });
});
