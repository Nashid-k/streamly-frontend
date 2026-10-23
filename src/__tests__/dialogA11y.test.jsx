import { useRef, useState } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RatingsTable from "../components/RatingsTable";
import Popover from "../components/Popover";
import GlobalShortcuts from "../components/GlobalShortcuts";
import { useConfirmDialog } from "../components/ConfirmDialog";

/* Surfaces that CLAIMED to be dialogs/menus but were not.
 *
 * The pattern under test: an element with `aria-modal="true"` and a full-screen
 * backdrop tells a screen reader that everything behind it is inert. If Tab
 * still walks out of the panel, and focus is never given back on close, the
 * claim is a lie — the keyboard user ends up typing into a page they cannot
 * see. Each case below fails against the pre-fix source. */

vi.mock("../api/movieService", () => ({
  movieService: {
    getSeasonEpisodes: vi.fn().mockResolvedValue({ episodes: [] }),
  },
}));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  document.body.style.overflow = "";
});

describe("RatingsTable behaves like the modal it announces", () => {
  it("moves focus into the panel on open", () => {
    render(<RatingsTable movie={{ id: 1, title: "Test Show" }} seasons={[]} onClose={() => {}} />);

    const dialog = screen.getByRole("dialog", { name: /episode ratings/i });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("keeps Tab inside the panel when it is on the last control", () => {
    render(<RatingsTable movie={{ id: 1, title: "Test Show" }} seasons={[]} onClose={() => {}} />);

    const dialog = screen.getByRole("dialog", { name: /episode ratings/i });
    const close = screen.getByRole("button", { name: /close ratings/i });
    close.focus();

    // fireEvent returns false when the handler called preventDefault(). Without
    // the trap this is true, and Tab walks into the page behind the backdrop.
    expect(fireEvent.keyDown(document, { key: "Tab" })).toBe(false);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<RatingsTable movie={{ id: 1, title: "Test Show" }} seasons={[]} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks background scroll while open and releases it on unmount", () => {
    const { unmount } = render(
      <RatingsTable movie={{ id: 1, title: "Test Show" }} seasons={[]} onClose={() => {}} />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});

describe("Popover is navigable without a mouse", () => {
  function Harness({ onClose = () => {} } = {}) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef(null);
    const close = () => {
      setOpen(false);
      onClose();
    };
    return (
      <div>
        <button type="button" ref={triggerRef} onClick={() => setOpen(true)}>
          Open menu
        </button>
        <Popover isOpen={open} onClose={close} triggerRef={triggerRef} role="menu">
          <button type="button" role="menuitem">
            First item
          </button>
          <button type="button" role="menuitem">
            Middle item
          </button>
          <button type="button" role="menuitem">
            Last item
          </button>
        </Popover>
      </div>
    );
  }

  function openMenu() {
    const trigger = screen.getByRole("button", { name: /open menu/i });
    trigger.focus();
    fireEvent.click(trigger);
    return { trigger, items: screen.getAllByRole("menuitem") };
  }

  it("moves focus onto the first item when it opens", () => {
    render(<Harness />);
    const { items } = openMenu();
    expect(document.activeElement).toBe(items[0]);
  });

  it("moves between items with the arrow keys", () => {
    render(<Harness />);
    const { items } = openMenu();

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);

    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(document, { key: "End" });
    expect(document.activeElement).toBe(items[2]);

    // Wraps past the end back to the top.
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const { trigger, items } = openMenu();
    // Simulate arrow-key navigation, so the menu — not the trigger — owns focus.
    items[1].focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    // <AnimatePresence> keeps the node through the exit fade; what matters is
    // that focus is handed back to the control that opened the menu.
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Tab so the page keeps the Tab order", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const { trigger, items } = openMenu();
    items[1].focus();

    fireEvent.keyDown(document, { key: "Tab" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });
});

describe("GlobalShortcuts sheet honours the same contract", () => {
  it("moves focus inside and gives it back on Escape", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open shortcuts";
    document.body.appendChild(trigger);
    trigger.focus();

    try {
      render(<GlobalShortcuts />);
      fireEvent.keyDown(window, { key: "?", shiftKey: true });

      const sheet = screen.getByRole("dialog", { name: /keyboard shortcuts/i });
      expect(sheet.contains(document.activeElement)).toBe(true);

      fireEvent.keyDown(document, { key: "Escape" });
      expect(document.activeElement).toBe(trigger);
    } finally {
      trigger.remove();
    }
  });
});

describe("ConfirmDialog uses the shared modal contract", () => {
  function Harness() {
    const { confirmDialog, ConfirmDialogRenderer } = useConfirmDialog();
    return (
      <div>
        <button type="button" onClick={() => confirmDialog({ title: "Delete?", message: "Sure?" })}>
          Delete
        </button>
        <ConfirmDialogRenderer />
      </div>
    );
  }

  it("moves focus into the panel and keeps Tab there", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Delete"));

    const panel = await screen.findByRole("alertdialog");
    // Initial focus is the cancel button: destructive prompts default to safe.
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(panel.querySelector("[data-dialog-initial]"));
    });
    expect(panel.contains(document.activeElement)).toBe(true);

    // Trap check: from the panel's last control, Tab must be swallowed.
    const controls = [...panel.querySelectorAll("button:not(:disabled)")];
    controls.at(-1).focus();
    expect(fireEvent.keyDown(document, { key: "Tab" })).toBe(false);
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("locks background scroll and cancels on Escape", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Delete"));

    await screen.findByRole("alertdialog");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    await vi.waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe("");
  });
});
