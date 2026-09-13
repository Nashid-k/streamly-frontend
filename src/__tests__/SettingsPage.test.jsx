import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsPage from "../pages/SettingsPage";
import { PreferencesProvider } from "../context/PreferencesContext";
import { ToastProvider } from "../components/Toast.jsx";

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
});
