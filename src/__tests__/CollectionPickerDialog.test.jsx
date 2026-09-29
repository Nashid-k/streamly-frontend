import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CollectionPickerDialog from "../components/CollectionPickerDialog";

/* The picker's create form is the one place a collection is born from inside
   a title screen. Publishing has to be a deliberate choice, so the control
   must default to Private and the chosen value must actually reach the create
   call (both wrappers that consume onCreateWithItems used to drop every
   argument after the name). */

const movie = { id: "tmdb-movie-550", title: "Fight Club" };
const collections = [
  { id: "c1", name: "Favorites", itemIds: [movie.id], visibility: "private" },
  { id: "c2", name: "Watch Party", itemIds: [], visibility: "public", publicId: "pub123" },
];

let onCreateWithItems;

beforeEach(() => {
  onCreateWithItems = vi.fn();
});

afterEach(cleanup);

function open(overrides = {}) {
  return render(
    <CollectionPickerDialog
      open
      movie={movie}
      collections={collections}
      onToggle={vi.fn()}
      onCreateWithItems={onCreateWithItems}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

function createVia(name, { visibility } = {}) {
  fireEvent.click(screen.getByRole("button", { name: /new collection/i }));
  fireEvent.change(screen.getByLabelText(/new collection name/i), {
    target: { value: name },
  });
  if (visibility === "public") {
    fireEvent.click(screen.getByRole("radio", { name: /public/i }));
  }
  fireEvent.click(screen.getByRole("button", { name: /create & add/i }));
}

describe("CollectionPickerDialog create form visibility", () => {
  it("opens the create form on Private", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /new collection/i }));

    expect(screen.getByRole("radio", { name: /private/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /public/i })).toHaveAttribute("aria-checked", "false");
  });

  it("creates private by default", () => {
    open();
    createVia("Sci-Fi Picks");

    expect(onCreateWithItems).toHaveBeenCalledTimes(1);
    expect(onCreateWithItems).toHaveBeenCalledWith("Sci-Fi Picks", [movie.id], "private");
  });

  it("passes public through when the viewer picks it", () => {
    open();
    createVia("Party List", { visibility: "public" });

    expect(onCreateWithItems).toHaveBeenCalledWith("Party List", [movie.id], "public");
  });

  it("switches the hint to the selected visibility", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /new collection/i }));
    expect(screen.getByText(/only you can see this collection/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /public/i }));
    expect(
      screen.getByText(/visible to anyone via its public link/i),
    ).toBeInTheDocument();
  });

  it("still refuses an empty name", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /new collection/i }));

    expect(screen.getByRole("button", { name: /create & add/i })).toBeDisabled();
    expect(onCreateWithItems).not.toHaveBeenCalled();
  });

  it("resets to Private when reopened", () => {
    const { rerender } = open();
    createVia("Made Public", { visibility: "public" });

    rerender(
      <CollectionPickerDialog
        open={false}
        movie={movie}
        collections={collections}
        onToggle={vi.fn()}
        onCreateWithItems={onCreateWithItems}
        onClose={vi.fn()}
      />,
    );
    rerender(
      <CollectionPickerDialog
        open
        movie={movie}
        collections={collections}
        onToggle={vi.fn()}
        onCreateWithItems={onCreateWithItems}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /new collection/i }));
    expect(screen.getByRole("radio", { name: /private/i })).toHaveAttribute("aria-checked", "true");
  });
});
