import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import PlayerPanel from "../components/player/chrome/PlayerPanel";

/* player-v4 parity for the sheet keyboard: ArrowUp/Down rove focus across the
   open pane's controls, Tab is trapped inside the sheet, ArrowLeft steps back
   (closes at the root), and the episodes header carries a real season picker
   when the data says more than one season exists. */

function mountSheet({
  panel = "settings",
  seasonsAvailable = null,
  onChangeSeason = null,
  onClose = vi.fn(),
  onBackToSettings = vi.fn(),
} = {}) {
  const panelRef = createRef();
  const { container } = render(
    <PlayerPanel
      panel={panel}
      panelRef={panelRef}
      onClose={onClose}
      onBackToSettings={onBackToSettings}
      seasonsAvailable={seasonsAvailable}
      onChangeSeason={onChangeSeason}
      season={1}
    >
      <button type="button">Row A</button>
      <button type="button">Row B</button>
      <button type="button">Row C</button>
    </PlayerPanel>,
  );
  const sheet = container.querySelector("#sheet");
  const rows = [...container.querySelectorAll(".pane button")];
  return { container, sheet, rows, onClose, onBackToSettings };
}

describe("PlayerPanel menu keyboard (v4 parity)", () => {
  it("moves focus with ArrowUp/ArrowDown across the pane's controls", () => {
    const { rows } = mountSheet();
    expect(rows.length).toBeGreaterThanOrEqual(3);
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
  });

  it("wraps the roving focus at both ends", () => {
    // Subpanels put the back button + sr-only close before the pane rows:
    // v4's focus order is exactly [bk, close, ...rows]. From RowC, ArrowDown
    // wraps to the FIRST control (the back button); from the first, ArrowUp
    // wraps to the LAST row.
    const { rows } = mountSheet({ panel: "episodes" });
    const last = rows[rows.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /close episodes/i }));
    fireEvent.keyDown(document.activeElement, { key: "ArrowUp" });
    expect(document.activeElement).toBe(last);
  });

  it("traps Tab inside the sheet", () => {
    const { rows } = mountSheet();
    const close = screen.getByRole("button", { name: /close panel/i });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
  });

  it("ArrowLeft closes at the root and steps back in a subpane", () => {
    const root = mountSheet({ panel: "settings" });
    fireEvent.keyDown(root.rows[0], { key: "ArrowLeft" });
    expect(root.onClose).toHaveBeenCalledTimes(1);
    root.onClose.mockClear();

    const sub = mountSheet({ panel: "audio" });
    fireEvent.keyDown(sub.rows[0], { key: "ArrowLeft" });
    expect(sub.onBackToSettings).toHaveBeenCalledTimes(1);
    expect(sub.onClose).not.toHaveBeenCalled();
  });

  it("does not hijack keys from a focused select or input", () => {
    const onChangeSeason = vi.fn();
    const { sheet, rows } = mountSheet({
      panel: "episodes",
      seasonsAvailable: [1, 2],
      onChangeSeason,
    });
    const select = screen.getByRole("combobox", { name: "Season" });
    expect([...sheet.querySelectorAll(".pane select")]).not.toContain(select);
    // The roving list walks pane controls; the header select is reached with
    // Tab, not hijacked into the cycle.
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    // Keys aimed AT the select stay with the select (native value change).
    select.focus();
    fireEvent.keyDown(select, { key: "ArrowDown" });
    expect(document.activeElement).toBe(select);
    expect(onChangeSeason).not.toHaveBeenCalled();
  });

  it("offers the season picker only when more than one season is available", () => {
    const first = mountSheet({ panel: "episodes", seasonsAvailable: [1, 2], onChangeSeason: vi.fn() });
    const select = screen.getByRole("combobox", { name: "Season" });
    expect(select.value).toBe("1");
    first.container.remove();

    mountSheet({ panel: "episodes", seasonsAvailable: [1], onChangeSeason: vi.fn() });
    expect(screen.queryByRole("combobox", { name: "Season" })).toBeNull();
    expect(screen.getByText(/season 1/i)).toBeInTheDocument();
  });

  it("reports the picked season as a number", () => {
    const onChangeSeason = vi.fn();
    mountSheet({ panel: "episodes", seasonsAvailable: [1, 2], onChangeSeason });
    fireEvent.change(screen.getByRole("combobox", { name: "Season" }), {
      target: { value: "2" },
    });
    expect(onChangeSeason).toHaveBeenCalledWith(2);
  });
});
