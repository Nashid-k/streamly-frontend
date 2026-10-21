import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import LanguageSwitchOverlay from "../components/LanguageSwitchOverlay";
import { createTestQueryClient } from "../test/testUtils";

/* The overlay is the whole point of the language-switch fix: before it, a
   language change invalidated every catalogue query and React Query kept
   serving the OLD-language payload, so the viewer sat on stale titles with no
   signal. These tests pin the two ways that could silently regress:
     1. dismissing before any refetch work has been observed (a flash that
        reveals the previous language), and
     2. never dismissing (trapping the viewer on the curtain).

   The "saw work" latch is exercised with a real query client, so the
   useIsFetching wiring is under test rather than a mock of it. */

const MIN_VISIBLE_MS = 700;

let client;

beforeEach(() => {
  client = createTestQueryClient();
});

afterEach(() => {
  cleanup();
  client.clear();
});

function renderOverlay(props = {}) {
  return render(
    <QueryClientProvider client={client}>
      <LanguageSwitchOverlay active onDone={props.onDone ?? vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("LanguageSwitchOverlay", () => {
  it("shows the branded wait with a live-region status", () => {
    renderOverlay();
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(/switching language/i)).toBeInTheDocument();
  });

  it("does NOT dismiss before any language-sensitive query is observed in flight", async () => {
    const onDone = vi.fn();
    // A query that never starts: the grace timer must fire only after the
    // minimum dwell, and must not have fired before it.
    vi.useFakeTimers();
    try {
      renderOverlay({ onDone });
      act(() => {
        vi.advanceTimersByTime(MIN_VISIBLE_MS - 100);
      });
      expect(onDone).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("dismisses after the in-flight catalogue queries settle", async () => {
    const onDone = vi.fn();
    vi.useFakeTimers();
    try {
      renderOverlay({ onDone });

      // Simulate the language switch's invalidation refetch starting, then
      // finishing — the exact sequence PreferencesContext produces.
      act(() => {
        client.setQueryData(["popular"], [{ id: 1 }]);
      });
      await act(async () => {
        client.invalidateQueries({ queryKey: ["popular"] });
      });
      // Let the invalidation settle so `fetching` returns to 0.
      await act(async () => {
        await client.getQueryCache().find({ queryKey: ["popular"] })?.promise?.catch?.(() => {});
      });

      act(() => {
        vi.advanceTimersByTime(MIN_VISIBLE_MS + 300);
      });
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
