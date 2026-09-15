import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
    expect(screen.getByText(/^player ui studio$/i)).toBeInTheDocument();
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
    const server1 = screen.getByRole("option", { name: /server 1, priority 1/i });
    fireEvent.keyDown(server1, { key: "ArrowDown" });

    const stored = JSON.parse(localStorage.getItem("setting-serverOrder"));
    expect(stored[0]).toBe("Server 2 (Fast)");
    expect(stored[1]).toBe("Server 1");
    // The rank badge follows the new order.
    expect(screen.getByRole("option", { name: /server 1, priority 2/i })).toBeInTheDocument();
  });

  it("opens the player UI studio with 5 presets and a live preview", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PreferencesProvider>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </PreferencesProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /open studio/i }));
    const studio = within(screen.getByRole("dialog", { name: /player ui studio/i }));

    // All six presets plus the live subtitle preview render.
    for (const name of ["Classic", "Apple TV", "Material", "Theater", "Studio", "Minimal"]) {
      expect(studio.getByRole("radio", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(studio.getByRole("radio", { name: /^classic/i })).toHaveAttribute("aria-checked", "true");
    expect(studio.getByText(/here is what your subtitles will look like/i)).toBeInTheDocument();
    // Every placeable control has a zone menu, including the new bottom center.
    expect(studio.getByLabelText(/play \/ pause placement/i)).toBeInTheDocument();
  });

  it("applies a studio preset to visibility, layout and storage", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PreferencesProvider>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </PreferencesProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /open studio/i }));
    fireEvent.click(screen.getByRole("radio", { name: /^minimal/i }));

    expect(localStorage.getItem("setting-playerUIPreset")).toBe('"minimal"');
    const layout = JSON.parse(localStorage.getItem("setting-playerUILayout"));
    expect(layout.playPause).toBe("bottomLeft");
    expect(layout.fullscreen).toBe("bottomRight");
    const controls = JSON.parse(localStorage.getItem("setting-playerControls"));
    expect(controls.playPause).toBe(true);
    expect(controls.jumpForwardBackward).toBe(true);
    expect(controls.brightness).toBe(false);
    expect(screen.getByRole("radio", { name: /^minimal/i })).toHaveAttribute("aria-checked", "true");
  });

  it("moves a control between zones and drops to a custom preset", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PreferencesProvider>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </PreferencesProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /open studio/i }));
    // Move Play/Pause to the bottom center via its placement menu.
    fireEvent.change(screen.getByLabelText(/play \/ pause placement/i), {
      target: { value: "bottomCenter" },
    });

    const layout = JSON.parse(localStorage.getItem("setting-playerUILayout"));
    expect(layout.playPause).toBe("bottomCenter");
    expect(localStorage.getItem("setting-playerUIPreset")).toBe('"custom"');
  });
});
