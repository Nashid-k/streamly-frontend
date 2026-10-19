import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterPill from "../components/browse/FilterPill";
import MenuItem from "../components/browse/MenuItem";

/* FilterPill contract: closing the panel must not drop keyboard focus to
   <body>. Selection and Escape hand focus back to the trigger; an outside
   click keeps focus where the user put it, and the first mount steals nothing. */

function renderPill() {
  render(
    <FilterPill label="Genre">
      {({ close }) => (
        <MenuItem
          label="Action"
          selected={false}
          onSelect={close}
        />
      )}
    </FilterPill>,
  );
  return screen.getByRole("button", { name: "Filter by Genre" });
}

describe("FilterPill focus management", () => {
  it("does not steal focus on first mount", () => {
    renderPill();
    expect(document.activeElement).toBe(document.body);
  });

  it("returns focus to the trigger when an option is chosen", () => {
    const trigger = renderPill();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "Action" }));

    expect(screen.queryByRole("option", { name: "Action" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to the trigger on Escape", () => {
    const trigger = renderPill();

    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("leaves focus where the user clicked on an outside mousedown", () => {
    const trigger = renderPill();
    fireEvent.click(trigger);

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    fireEvent.mouseDown(outside);

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
