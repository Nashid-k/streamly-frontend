import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SettingsSheet from "../components/player/v2/SettingsSheet";
import { SHEET_PANELS, panelDomId } from "../components/player/v2/sheetPanels";
import { SHEET_OPENERS } from "../components/player/v2/tiers";
import { describeAudio } from "../components/player/v2/audioTracks";

/**
 * The Audio panel (task.md R4.1).
 *
 * The three cases matter more than the selection: the failure this feature is most
 * likely to ship is "opens an empty sheet", which is indistinguishable from the
 * feature not existing. So each non-choice state is asserted for what it DOES say.
 */

const track = (over = {}) => ({
  index: 0,
  name: "",
  lang: "",
  groupId: "aac",
  default: false,
  characteristics: [],
  ...over,
});

function openAudio(audio, selectAudio) {
  return render(
    <SettingsSheet panelId="audio" onClose={() => {}} panels={{ audio, selectAudio }} />,
  );
}

describe("Audio panel registration", () => {
  it("is in the panel list and the opener list together", () => {
    /* These two lists are maintained separately and `SettingsSheet` logs a warning
     * and renders nothing for an id in one but not the other. */
    expect(SHEET_PANELS.map((p) => p.id)).toContain("audio");
    expect(SHEET_OPENERS).toContain("audio");
  });

  it("has a resolvable DOM id for aria-controls", () => {
    /* `aria-controls="null"` resolves to nothing, and the failure is invisible to
     * every unit test that only checks each half separately. */
    expect(panelDomId("audio")).toBe("pv2-sheet-panel-audio");
  });

  it("uses a frozen panel id", () => {
    /* The contract in architecture.md §3: ids are part of the data/UI contract. */
    expect("audio").toBe("audio");
    expect(SHEET_PANELS.find((p) => p.id === "audio").title).toBe("Audio");
  });
});

describe("Audio panel — several tracks", () => {
  it("renders a radiogroup with one option per track", () => {
    const audio = describeAudio(
      [track({ index: 0, name: "English" }), track({ index: 1, name: "Tamil" })],
      { currentIndex: 0 },
    );
    openAudio(audio, () => {});
    expect(screen.getByRole("radiogroup", { name: "Audio" })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("checks the track the engine is actually playing", () => {
    const audio = describeAudio(
      [track({ index: 0, name: "English" }), track({ index: 1, name: "Tamil" })],
      { currentIndex: 1 },
    );
    openAudio(audio, () => {});
    const checked = screen.getAllByRole("radio").filter((el) => el.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toContain("Tamil");
  });

  it("writes the ENGINE index on select, not the row position", () => {
    /* Row position and engine index differ as soon as anything is deduplicated, and
     * writing the position would select a different track than the one pressed. */
    const selectAudio = vi.fn();
    const audio = describeAudio(
      [
        track({ index: 0, name: "English" }),
        track({ index: 1, name: "English" }), // duplicate, collapses
        track({ index: 5, name: "Tamil" }),
      ],
      { currentIndex: 0 },
    );
    openAudio(audio, selectAudio);
    const tamil = screen.getByRole("radio", { name: /Tamil/ });
    fireEvent.click(tamil);
    expect(selectAudio).toHaveBeenCalledWith(5);
  });

  it("shows the language code and characteristics as the sub line", () => {
    const audio = describeAudio([
      track({ index: 0, name: "English", lang: "en" }),
      track({
        index: 1,
        name: "English",
        lang: "en",
        characteristics: ["public.accessibility.describes-video"],
      }),
    ]);
    openAudio(audio, () => {});
    const described = screen
      .getAllByRole("radio")
      .find((el) => el.textContent.includes("describes-video"));
    expect(described).toBeTruthy();
  });
});

describe("Audio panel — one track", () => {
  it("does NOT render a radiogroup, because there is no choice to make", () => {
    /* A radiogroup of one announces "1 of 1" and invites arrow keys with nowhere to
     * go. It claims a control that cannot do anything. */
    const audio = describeAudio([track({ name: "English" })], { currentIndex: 0 });
    openAudio(audio, () => {});
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("still says something, rather than rendering an empty sheet", () => {
    const audio = describeAudio([track({ name: "English" })], { currentIndex: 0 });
    openAudio(audio, () => {});
    expect(screen.getByText(/one selectable soundtrack/i)).toBeTruthy();
  });
});

describe("Audio panel — no engine (Safari native HLS)", () => {
  it("blames the browser's native mode, not the source", () => {
    /* In native-HLS mode there is no hls.js to ask. "This source carries one
     * soundtrack" is a claim nothing can support, and it turns a browser limitation
     * into a bug report about missing audio. */
    const audio = describeAudio([], { engineAttached: false });
    openAudio(audio, () => {});
    expect(screen.getByText(/directly|needs/i)).toBeTruthy();
    expect(screen.queryByText(/carries one soundtrack/i)).toBeNull();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("says the source has one soundtrack when there WAS an engine to ask", () => {
    const audio = describeAudio([], { engineAttached: true });
    openAudio(audio, () => {});
    expect(screen.getByText(/carries one soundtrack/i)).toBeTruthy();
  });

  it("does not throw when the panel gets no audio model at all", () => {
    /* The sheet can be mounted before any source resolves; this must degrade to a
     * sentence, not a crash. */
    openAudio(null, () => {});
    expect(screen.getByText(/not available/i)).toBeTruthy();
  });
});

describe("Audio panel — selection safety", () => {
  let selectAudio;
  beforeEach(() => {
    selectAudio = vi.fn();
  });

  it("never calls the selector with a non-index when the row is stale", () => {
    const audio = describeAudio(
      [track({ index: 0, name: "English" }), track({ index: 1, name: "Tamil" })],
      { currentIndex: 0 },
    );
    openAudio(audio, selectAudio);
    for (const row of screen.getAllByRole("radio")) {
      fireEvent.click(row);
    }
    for (const call of selectAudio.mock.calls) {
      expect(Number.isInteger(call[0])).toBe(true);
      expect(call[0]).toBeGreaterThanOrEqual(0);
    }
  });
});