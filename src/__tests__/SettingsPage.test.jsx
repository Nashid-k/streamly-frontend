import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsPage from "../pages/SettingsPage";
import { PreferencesProvider } from "../context/PreferencesContext";
import { ToastProvider } from "../components/Toast.jsx";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "default";
});

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

    // All 7 sections are present in the DOM
    expect(screen.getByRole("heading", { name: /^account$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^appearance$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^playback$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^server order$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^subtitles$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^advertisements$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^febbox integration/i })).toBeInTheDocument();

    // Key settings and controls
    expect(screen.getByText(/^theme$/i)).toBeInTheDocument();
    expect(screen.getByText(/^episode view style$/i)).toBeInTheDocument();
    expect(screen.getByText(/^detail view type$/i)).toBeInTheDocument();
    expect(screen.getByText(/^use image logos$/i)).toBeInTheDocument();
    expect(screen.getByText(/^auto skip intro$/i)).toBeInTheDocument();
    expect(screen.getByText(/^default language$/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/paste your ui cookie here/i)).toBeInTheDocument();
  });

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

    // The theme trigger exposes its state via aria-label.
    fireEvent.click(screen.getByRole("button", { name: /theme, current/i }));
    fireEvent.click(screen.getByRole("button", { name: /cinejoy emerald/i }));

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

    for (const name of ["All", "Account", "Appearance", "Playback", "Servers", "Subtitles", "Ads", "Febbox", "Notifications"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
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
    const lisbon = screen.getByRole("option", { name: /lisbon, priority 1/i });
    fireEvent.keyDown(lisbon, { key: "ArrowDown" });

    const stored = JSON.parse(localStorage.getItem("setting-serverOrder"));
    expect(stored[0]).toBe("Nebula");
    expect(stored[1]).toBe("Lisbon");
    // The rank badge follows the new order.
    expect(screen.getByRole("option", { name: /lisbon, priority 2/i })).toBeInTheDocument();
  });

  it("disconnects Trakt without a bogus connected toast", () => {
    localStorage.setItem("streamly_trakt", "moviebuff");
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PreferencesProvider>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </PreferencesProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/connected as @moviebuff/i)).toBeInTheDocument();
    // Trakt's Manage button comes first in the DOM (Simkl's follows).
    fireEvent.click(screen.getAllByRole("button", { name: "Manage" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(localStorage.getItem("streamly_trakt")).toBeNull();
    expect(screen.queryByText(/connected as @moviebuff/i)).not.toBeInTheDocument();
  });
});
