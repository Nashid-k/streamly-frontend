import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import BecauseSelector from "../components/rails/BecauseSelector";
import { renderWithProviders } from "../test/testUtils";

/* The because-you-watched rail head (cinejoy's anchor picker): the watched
   title is a bold button that opens the watch history as a listbox, and
   picking a title re-bases the rail on it. The pinned contract: the picker
   lists every watched title, marks the active one, only reports a DIFFERENT
   pick, and hands focus back to the trigger after a keyboard close. */

const ANCHOR = { id: "movie-238", title: "The Godfather" };
const HISTORY = [
  { id: "movie-238", title: "The Godfather" },
  { id: "movie-1064213", title: "Anora" },
  { id: "movie-27205", title: "Inception" },
];

function renderPicker(props = {}) {
  const onPick = vi.fn();
  renderWithProviders(
    <BecauseSelector anchor={ANCHOR} items={HISTORY} onPick={onPick} {...props} />,
    { route: "/" },
  );
  return { onPick };
}

describe("BecauseSelector anchor picker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens the watch history and marks the active anchor", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "The Godfather" }));
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "The Godfather",
      "Anora",
      "Inception",
    ]);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });

  it("re-bases the rail on a different watched title and closes", () => {
    const { onPick } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "The Godfather" }));
    fireEvent.click(screen.getByRole("option", { name: "Inception" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("movie-27205");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("re-picking the active anchor changes nothing and just closes", () => {
    const { onPick } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "The Godfather" }));
    fireEvent.click(screen.getByRole("option", { name: "The Godfather" }));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Escape closes and returns focus to the trigger", () => {
    renderPicker();
    const trigger = screen.getByRole("button", { name: "The Godfather" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("an outside mousedown closes without reporting a pick", () => {
    const { onPick } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "The Godfather" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });
});
