import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import VerifyEmailPage from "../pages/VerifyEmailPage";
import { renderWithProviders } from "../test/testUtils";

/* /verify-email exists for exactly one reason: mail clients and corporate link
   scanners prefetch URLs, so the account must NOT be created by loading this
   page. Every test below is really a restatement of "no POST without a click". */
function setup({ token = "tok_abc", completeEmailVerification } = {}) {
  const complete = completeEmailVerification ?? vi.fn().mockResolvedValue({ success: true });
  const authValue = {
    user: null,
    isAuthenticated: false,
    hasAccount: false,
    signIn: { open: false, mode: "signin", reason: "" },
    openSignIn: vi.fn(),
    closeSignIn: vi.fn(),
    requireAuth: () => true,
    registerAccount: vi.fn(),
    completeEmailVerification: complete,
    loginWithEmail: vi.fn(),
    signOut: vi.fn(),
    syncToCloud: vi.fn(),
    deleteCloudData: vi.fn(),
  };
  const utils = renderWithProviders(<VerifyEmailPage />, {
    route: token ? `/verify-email?token=${token}` : "/verify-email",
    authValue,
  });
  return { ...utils, complete };
}

describe("VerifyEmailPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does NOT verify on mount — the token survives page load", async () => {
    const { complete } = setup();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm my email/i })).toBeInTheDocument();
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it("POSTs exactly once when the confirm button is pressed", async () => {
    const { complete } = setup();
    fireEvent.click(screen.getByRole("button", { name: /confirm my email/i }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(complete).toHaveBeenCalledWith("tok_abc");
    expect(await screen.findByText(/email verified/i)).toBeInTheDocument();
  });

  it("ignores a second click, so the single-use token cannot be spent twice", async () => {
    let resolve;
    const complete = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const { complete: spy } = setup({ completeEmailVerification: complete });
    const button = screen.getByRole("button", { name: /confirm my email/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(spy).toHaveBeenCalledTimes(1);
    resolve({ success: true });
    await screen.findByText(/email verified/i);
  });

  it("offers no confirm button when the link carries no token", () => {
    setup({ token: "" });
    expect(screen.queryByRole("button", { name: /confirm my email/i })).toBeNull();
    expect(screen.getByText(/no verification token/i)).toBeInTheDocument();
    expect(screen.getByText(/sign up again/i)).toBeInTheDocument();
    // The way forward is a real link, not a dead end.
    expect(screen.getByRole("link", { name: /go to sign in/i })).toBeInTheDocument();
  });

  it("maps a 410 to the expired message", async () => {
    const complete = vi.fn().mockResolvedValue({ success: false, status: 410 });
    setup({ completeEmailVerification: complete });
    fireEvent.click(screen.getByRole("button", { name: /confirm my email/i }));
    expect(await screen.findByText(/link has expired/i)).toBeInTheDocument();
  });

  it("maps a 409 to 'sign in instead'", async () => {
    const complete = vi.fn().mockResolvedValue({ success: false, status: 409 });
    setup({ completeEmailVerification: complete });
    fireEvent.click(screen.getByRole("button", { name: /confirm my email/i }));
    expect(await screen.findByText(/already has an account/i)).toBeInTheDocument();
  });

  it("falls back to the invalid message for any other failure", async () => {
    const complete = vi.fn().mockResolvedValue({ success: false, status: 400 });
    setup({ completeEmailVerification: complete });
    fireEvent.click(screen.getByRole("button", { name: /confirm my email/i }));
    expect(await screen.findByText(/isn't valid/i)).toBeInTheDocument();
  });
});