import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollRestoration } from "../hooks/useScrollRestoration";

/* These two tests pin the Layout ⇄ useScrollRestoration contract through
   `window.__streamlyRouteAnimating`:

   · PUSH keeps its commit-time reset to top — importantly, it is NOT gated on
     the animation flag, because under AnimatePresence mode="popLayout" the
     document at commit is already the entering page and a gated reset would
     leave the viewer staring at a mid-page position during the whole fade
     (the exact "scrolls up from the bottom" bug this batch fixes).
   · POP defers its first restore attempt until the flag clears, so Back lands
     after the enter animation has settled instead of adjusting mid-flight,
     while the bounded wait (SETTLE_MAX_WAIT_MS) keeps a missed animation
     callback from stranding the restore.

   Layout itself is what flips the flag in production; the harness sets it
   manually so the test covers the hook side of the contract without mounting
   framer's animation runtime. */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function Page({ label }) {
  useScrollRestoration();
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="loc">{location.key}</span>
      <span data-testid="where">{label || location.pathname}</span>
      <button type="button" onClick={() => navigate("/b")}>
        toB
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        back
      </button>
    </div>
  );
}

function mountHarness() {
  return render(
    <MemoryRouter initialEntries={["/a"]}>
      <Routes>
        <Route path="*" element={<Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useScrollRestoration × route-animation flag", () => {
  let scrollToSpy;

  beforeEach(() => {
    sessionStorage.clear();
    scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    delete window.__streamlyRouteAnimating;
    scrollToSpy.mockRestore();
  });

  it("resets PUSH to top immediately, even while a route transition is animating", async () => {
    mountHarness();
    window.__streamlyRouteAnimating = true;

    fireEvent.click(screen.getByText("toB"));

    await waitFor(() =>
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" }),
    );
  });

  it("defers the POP restore until the animation flag clears, then restores the saved position", async () => {
    mountHarness();
    const keyA = screen.getByTestId("loc").textContent;

    // Leave /a the way a real closed page would: navigate away, then stash the
    // position the Back restore is expected to land on.
    fireEvent.click(screen.getByText("toB"));
    sessionStorage.setItem(
      `scroll-${keyA}`,
      JSON.stringify({ y: 500, savedAt: Date.now() }),
    );

    // Simulate the transition (Layout would hold this flag through the exit
    // and the enter animation). The restore must NOT fire its first attempt
    // while it is held.
    window.__streamlyRouteAnimating = true;
    scrollToSpy.mockClear();
    fireEvent.click(screen.getByText("back"));

    // The PUSH reset to /b may still have a double-rAF in flight — filter by
    // target instead of call count: while the flag is held, no restore to the
    // saved position may fire yet.
    await sleep(120);
    expect(scrollToSpy.mock.calls.some((call) => call[0]?.top === 500)).toBe(false);

    // Flag cleared → the restore lands on the saved position.
    window.__streamlyRouteAnimating = false;
    await waitFor(() =>
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 500, left: 0, behavior: "auto" }),
    );
  });
});
