import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useState } from "react";
import { AuthProvider } from "../context/AuthContext";
import { useAppAuth, useSyncStatus } from "../context/auth";

function TestConsumer() {
  const { user, isAuthenticated, hasAccount, requireAuth, loginWithEmail, logout } = useAppAuth();
  const { syncStatus } = useSyncStatus();
  // The gate is asked from a click, never during render — it opens the sign-in
  // dialog, and a state update from render is a React error, not a shortcut.
  const [gateResult, setGateResult] = useState("unset");
  return (
    <div>
      <span data-testid="auth-status">{isAuthenticated ? "authenticated" : "guest"}</span>
      <span data-testid="account-status">{hasAccount ? "account" : "no-account"}</span>
      <span data-testid="user-name">{user?.name || "none"}</span>
      <span data-testid="sync-status">{syncStatus}</span>
      <span data-testid="gate-result">{gateResult}</span>
      <button onClick={() => setGateResult(requireAuth("gateReason") ? "allowed" : "refused")}>
        Try Gated Action
      </button>
      <button
        onClick={() => loginWithEmail({ email: "test@streamly.io", password: "correct horse battery" })}
      >
        Login Email
      </button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

function jsonResponse(body, ok = true) {
  return { ok, status: ok ? 200 : 401, json: async () => body };
}

describe("AuthContext and useAppAuth", () => {
  let fetchSpy;

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ success: false }));
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to unauthenticated when localStorage is empty", () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId("auth-status")).toHaveTextContent("guest");
    expect(screen.getByTestId("account-status")).toHaveTextContent("no-account");
    expect(screen.getByTestId("user-name")).toHaveTextContent("none");
  });

  it("signs in with email and persists the profile plus a sync token", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        success: true,
        user: { id: "acc-1", accountId: "acc-1", name: "Test User", email: "test@streamly.io" },
        syncToken: "tok-1",
        userData: { watchlist: [], watchHistory: [], collections: [] },
      })
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText("Login Email").click();
    });

    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("account-status")).toHaveTextContent("account");
    expect(screen.getByTestId("user-name")).toHaveTextContent("Test User");

    const saved = JSON.parse(localStorage.getItem("streamly_user") || "{}");
    expect(saved.email).toBe("test@streamly.io");
    expect(localStorage.getItem("streamly_sync_token")).toBe("tok-1");

    // The password must never be stored, logged, or echoed back to the client.
    expect(JSON.stringify(saved)).not.toContain("correct horse battery");
    expect(JSON.stringify(saved)).not.toContain("passwordHash");
  });

  it("refuses the gate while anonymous and allows it once an account exists", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText("Try Gated Action").click();
    });
    expect(screen.getByTestId("gate-result")).toHaveTextContent("refused");

    fetchSpy.mockResolvedValue(
      jsonResponse({
        success: true,
        user: { id: "acc-2", accountId: "acc-2", name: "Test User", email: "test@streamly.io" },
        syncToken: "tok-2",
        userData: {},
      })
    );
    await act(async () => {
      screen.getByText("Login Email").click();
    });
    await act(async () => {
      screen.getByText("Try Gated Action").click();
    });

    expect(screen.getByTestId("gate-result")).toHaveTextContent("allowed");
  });

  it("treats a leftover Google profile as no account, so the gate still applies", async () => {
    // googleId is no longer honoured. A stale profile from the retired provider
    // would otherwise pass the gate and then fail every sync.
    localStorage.setItem(
      "streamly_user",
      JSON.stringify({ name: "Old", email: "old@test.com", googleId: "g-1" })
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("account-status")).toHaveTextContent("no-account");
    await act(async () => {
      screen.getByText("Try Gated Action").click();
    });
    expect(screen.getByTestId("gate-result")).toHaveTextContent("refused");
  });

  it("logs out cleanly and removes user from storage", async () => {
    localStorage.setItem(
      "streamly_user",
      JSON.stringify({ id: "acc-3", accountId: "acc-3", name: "Logged In", email: "user@test.com" })
    );
    localStorage.setItem("streamly_sync_token", "tok-3");

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("user-name")).toHaveTextContent("Logged In");

    await act(async () => {
      screen.getByText("Logout").click();
    });

    expect(screen.getByTestId("auth-status")).toHaveTextContent("guest");
    expect(screen.getByTestId("user-name")).toHaveTextContent("none");
    expect(localStorage.getItem("streamly_user")).toBeNull();
    expect(localStorage.getItem("streamly_sync_token")).toBeNull();
  });

  it("discards a guest library when an account is adopted, so it cannot be uploaded", async () => {
    // The leak this prevents: a guest browses, signs up, and the scheduled sync
    // that follows setUser ships their watchlist under the new accountId.
    // JSON.stringify, not the array itself: setItem coerces to "[object Object]",
    // which JSON.parse then rejects — the keys would read as empty and this test
    // would pass for the wrong reason.
    localStorage.setItem("aios_my_list", JSON.stringify([{ id: 1, title: "Guest Movie" }]));
    localStorage.setItem("aios_continue_watching", JSON.stringify([{ id: 2, title: "Guest Show" }]));
    localStorage.setItem("aios_my_collections", JSON.stringify([{ id: "c1", name: "Guest Collection" }]));
    localStorage.setItem("aios_search_history", "guest search");

    fetchSpy.mockResolvedValue(
      jsonResponse({
        success: true,
        user: { id: "acc-4", accountId: "acc-4", name: "Fresh", email: "fresh@test.com" },
        syncToken: "tok-4",
        userData: { watchlist: [], watchHistory: [], collections: [] },
      })
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText("Login Email").click();
    });

    expect(screen.getByTestId("account-status")).toHaveTextContent("account");
    // The guest rows are gone. Asserting their absence rather than the exact
    // stored value: the hooks normalise an emptied key back to [] on the next
    // read, and "[]" is as correct as "null" here.
    for (const key of ["aios_my_list", "aios_continue_watching", "aios_my_collections"]) {
      expect(JSON.parse(localStorage.getItem(key) || "[]")).toEqual([]);
    }
    // Search history never leaves the device, so there is nothing to leak and no
    // reason to punish the user for it.
    expect(localStorage.getItem("aios_search_history")).toBe("guest search");
  });

  it("keeps the local library when the same account signs in again", async () => {
    // No token on mount, so the pull-on-load effect stands down and this test
    // measures exactly one thing: the account-change check inside adoptSession.
    localStorage.setItem(
      "streamly_user",
      JSON.stringify({ id: "acc-5", accountId: "acc-5", name: "Returning", email: "back@test.com" })
    );
    localStorage.setItem("aios_my_list", JSON.stringify([{ id: 7, title: "Mine" }]));

    fetchSpy.mockResolvedValue(
      jsonResponse({
        success: true,
        user: { id: "acc-5", accountId: "acc-5", name: "Returning", email: "back@test.com" },
        syncToken: "tok-5",
        userData: { watchlist: [{ id: 9, title: "From cloud" }] },
      })
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText("Login Email").click();
    });

    // Same account on the same device: merge, never wipe.
    const list = JSON.parse(localStorage.getItem("aios_my_list") || "[]");
    expect(list.map((m) => m.id).sort()).toEqual([7, 9]);
  });

  it("provides fallback methods when used outside AuthProvider", () => {
    function StandaloneComponent() {
      const auth = useAppAuth();
      return <div data-testid="fallback">{auth.isAuthenticated ? "yes" : "no"}</div>;
    }

    render(<StandaloneComponent />);
    expect(screen.getByTestId("fallback")).toHaveTextContent("no");
  });
});
