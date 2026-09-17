import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsPage from "../pages/SettingsPage";
import { PreferencesProvider } from "../context/PreferencesContext";
import { ToastProvider } from "../components/Toast.jsx";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "default";
});

function renderPage(route = "/settings") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <PreferencesProvider>
        <ToastProvider>
          <SettingsPage />
        </ToastProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}

describe("SettingsPage", () => {
  it("renders all Cinejoy settings sections simultaneously", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PreferencesProvider>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </PreferencesProvider>
      </MemoryRouter>
    );

    // All 6 sections are present in the DOM
    expect(screen.getByRole("heading", { name: /^account$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^appearance$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^playback$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^server order$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^subtitles$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^notifications$/i })).toBeInTheDocument();
    // Removed integrations stay gone.
    expect(screen.queryByRole("heading", { name: /^advertisements$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^febbox integration/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/connect trakt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/connect simkl/i)).not.toBeInTheDocument();

    // Key settings and controls
    expect(screen.getByText(/^theme$/i)).toBeInTheDocument();
    expect(screen.getByText(/^episode view style$/i)).toBeInTheDocument();
    expect(screen.getByText(/^detail view type$/i)).toBeInTheDocument();
    expect(screen.getByText(/^use image logos$/i)).toBeInTheDocument();
    expect(screen.getByText(/^auto skip intro$/i)).toBeInTheDocument();
    expect(screen.getByText(/^default language$/i)).toBeInTheDocument();
    // Player UI Studio is removed from settings entirely.
    expect(screen.queryByText(/player ui studio/i)).not.toBeInTheDocument();
  }, 15000);

  it("can toggle switches and segmented buttons", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PreferencesProvider>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </PreferencesProvider>
      </MemoryRouter>
    );

    const autoSkipSwitch = screen.getByRole("switch", { name: /auto skip intro/i });
    expect(autoSkipSwitch).toHaveAttribute("aria-checked", "false");
    fireEvent.click(autoSkipSwitch);
    expect(autoSkipSwitch).toHaveAttribute("aria-checked", "true");

    const gridBtn = screen.getByRole("radio", { name: /^grid$/i });
    fireEvent.click(gridBtn);
    expect(gridBtn).toHaveAttribute("aria-checked", "true");
  });

  it("applies the chosen theme to the document element", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PreferencesProvider>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </PreferencesProvider>
      </MemoryRouter>
    );

    // The theme trigger exposes its state via aria-label; the popup lists
    // themes as listbox options.
    fireEvent.click(screen.getByRole("button", { name: /theme, current/i }));
    fireEvent.click(screen.getByRole("option", { name: /cinejoy emerald/i }));

    expect(document.documentElement.dataset.theme).toBe("emerald");
    expect(localStorage.getItem("setting-theme")).toBe('"emerald"');
  });

  it("offers an All tab plus every section filter, Notifications included", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PreferencesProvider>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </PreferencesProvider>
      </MemoryRouter>
    );

    for (const name of ["All", "Account", "Appearance", "Playback", "Servers", "Subtitles", "Notifications"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    // Removed integrations have no tabs.
    expect(screen.queryByRole("button", { name: "Ads" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Febbox" })).not.toBeInTheDocument();
    // All is active by default — every section renders.
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: /^notifications$/i })).toBeInTheDocument();
  });

  it("isolates one section per tab and restores everything via All", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PreferencesProvider>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </PreferencesProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Servers" }));

    expect(screen.getByRole("heading", { name: /^server order$/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^account$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^appearance$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All" }));

    expect(screen.getByRole("heading", { name: /^account$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^server order$/i })).toBeInTheDocument();
  });

  it("reorders servers from the keyboard and persists the new priority", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PreferencesProvider>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </PreferencesProvider>
      </MemoryRouter>
    );

    // Arrow keys move the focused row (up/down arrow buttons are gone).
    const server1 = screen.getByRole("listitem", { name: /server 1, priority 1/i });
    fireEvent.keyDown(server1, { key: "ArrowDown" });

    const stored = JSON.parse(localStorage.getItem("setting-serverOrder"));
    expect(stored[0]).toBe("Server 2 (Fast)");
    expect(stored[1]).toBe("Server 1");
    // The rank badge follows the new order.
    expect(screen.getByRole("listitem", { name: /server 1, priority 2/i })).toBeInTheDocument();
  });

  it("filters against visible copy, including the reset card", () => {
    renderPage();
    const input = screen.getByLabelText(/filter settings/i);

    fireEvent.change(input, { target: { value: "watchlist" } });
    expect(screen.getByText(/my watchlist/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^appearance$/i })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "reset" } });
    expect(screen.getByRole("heading", { name: /reset all preferences/i })).toBeInTheDocument();
    expect(screen.queryByText(/no settings match/i)).not.toBeInTheDocument();

    // No visible copy mentions MongoDB, so searching it must report no match
    // instead of pointing at a card whose text cannot be seen.
    fireEvent.change(input, { target: { value: "mongodb" } });
    expect(screen.getByText(/no settings match/i)).toBeInTheDocument();
  });

  it("keeps only one popup open at a time", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /theme, current/i }));
    expect(screen.getByRole("dialog", { name: /choose a theme/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /seek time, current/i }));
    // The theme dialog animates out, then unmounts.
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /choose a theme/i })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("listbox", { name: /seek time/i })).toBeInTheDocument();
  });

  it("moves focus into the sign-in dialog and restores it on close", () => {
    renderPage();
    const trigger = screen.getByRole("button", { name: /^sign in$/i });
    trigger.focus();

    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    // Focus returns to the opener; body scroll lock is released.
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("reads the initial tab from the URL", () => {
    renderPage("/settings?tab=servers");

    expect(screen.getByRole("button", { name: "Servers" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: /server order/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^account$/i })).not.toBeInTheDocument();
  });
});

