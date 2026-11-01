import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../app/Layout";
import { renderWithProviders } from "../test/testUtils";

/* The route transition wrapper used to be keyed on `pathname + search`, so
   every query-string update — the debounced live-search sync above all —
   unmounted and remounted the whole page. The visible symptom was the search
   box losing its caret after each keystroke (plus a scroll jump and a full
   page transition per letter). A query-string change is in-page state and must
   keep the mounted page; only a pathname change is a new page. */

let mounts = 0;

function Probe() {
  // useState's lazy initialiser runs once per MOUNT, so a remount bumps this
  // while a plain re-render does not.
  const [instance] = useState(() => ++mounts);
  const [params, setParams] = useSearchParams();
  return (
    <div>
      <span data-testid="instance">{instance}</span>
      <span data-testid="q">{params.get("q") || ""}</span>
      <input data-testid="probe-input" aria-label="probe" />
      <button
        type="button"
        onClick={() =>
          setParams({ q: (params.get("q") || "") + "a" }, { replace: true })
        }
      >
        type
      </button>
    </div>
  );
}

beforeEach(() => {
  mounts = 0;
  sessionStorage.clear();
});

describe("Layout route transition key", () => {
  it("keeps the page mounted and focused across query-string updates", async () => {
    renderWithProviders(
      <Layout>
        <Probe />
      </Layout>,
      { route: "/search" },
    );

    const input = screen.getByTestId("probe-input");
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.click(screen.getByText("type"));
    await waitFor(() => expect(screen.getByTestId("q").textContent).toBe("a"));
    expect(screen.getByTestId("instance").textContent).toBe("1");

    fireEvent.click(screen.getByText("type"));
    await waitFor(() => expect(screen.getByTestId("q").textContent).toBe("aa"));
    expect(screen.getByTestId("instance").textContent).toBe("1");

    expect(screen.getByTestId("probe-input")).toBe(input);
    expect(document.activeElement).toBe(input);
  });
});
