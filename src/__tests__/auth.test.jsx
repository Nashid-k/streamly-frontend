import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AuthProvider } from "../context/AuthContext";
import { useAppAuth, useSyncStatus } from "../context/auth";

function TestConsumer() {
  const { user, isAuthenticated, loginAsGuest, logout } = useAppAuth();
  const { syncStatus } = useSyncStatus();
  return (
    <div>
      <span data-testid="auth-status">{isAuthenticated ? "authenticated" : "guest"}</span>
      <span data-testid="user-name">{user?.name || "none"}</span>
      <span data-testid="sync-status">{syncStatus}</span>
      <button onClick={() => loginAsGuest("Test User", "test@streamly.io")}>Login Guest</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

describe("AuthContext and useAppAuth", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defaults to unauthenticated when localStorage is empty", () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId("auth-status")).toHaveTextContent("guest");
    expect(screen.getByTestId("user-name")).toHaveTextContent("none");
  });

  it("can log in as guest and persist user to storage", async () => {
    let fetchCalls = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCalls += 1;
      return {
        ok: true,
        json: async () => ({
          success: true,
          user: { name: "Test User", email: "test@streamly.io", provider: "guest" },
        }),
      };
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText("Login Guest").click();
    });

    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("user-name")).toHaveTextContent("Test User");

    const saved = JSON.parse(localStorage.getItem("streamly_user") || "{}");
    expect(saved.email).toBe("test@streamly.io");

    // Guests are LOCAL-ONLY: no /api/auth call, no cloud write, ever.
    // (The old flow POSTed every guest to /api/auth, collapsing all anonymous
    // visitors into one shared viewer@streamly.io Mongo document.)
    expect(fetchCalls).toBe(0);
    expect(localStorage.getItem("streamly_sync_token")).toBeNull();
  });

  it("logs out cleanly and removes user from storage", async () => {
    localStorage.setItem(
      "streamly_user",
      JSON.stringify({ name: "Logged In", email: "user@test.com", provider: "google" })
    );

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
