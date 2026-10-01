import { describe, it, expect } from "vitest";
import {
  SHEET_PANELS,
  panelDefinition,
  panelDomId,
  panelTitle,
  nextPanelId,
} from "../components/player/v2/sheetPanels";
import { SHEET_OPENERS } from "../components/player/v2/tiers";

describe("sheetPanels (3.24)", () => {
  it("covers every opener the transport can press", () => {
    // The transport's control map is frozen (`TIER_B_CONTROLS`/`TOUCH_ZONES`), and
    // `TransportBar` calls `onOpenSheet(controlId)` for anything in
    // `SHEET_OPENERS`. An opener with no panel renders an open sheet with an empty
    // body — which reads as "this button is broken", not "this is unfinished".
    for (const opener of SHEET_OPENERS) {
      expect(panelDefinition(opener), `no panel for opener "${opener}"`).not.toBeNull();
    }
  });

  it("adds no panel the transport cannot open", () => {
    // The converse of the test above, and the one that catches a typo'd id: a
    // panel nothing can reach is dead code that still has to be maintained.
    for (const panel of SHEET_PANELS) {
      expect(SHEET_OPENERS, `unreachable panel "${panel.id}"`).toContain(panel.id);
    }
  });

  it("has unique ids", () => {
    // Duplicated ids are invisible in the list but fatal in `BY_ID`: the second
    // definition silently wins, so the first is unreachable and untested.
    const ids = SHEET_PANELS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every panel a non-empty title", () => {
    // The title is the sheet's only heading. An empty one renders a blank bar with
    // a close button and no name, which is worse than no title: it looks like a
    // rendering fault rather than a missing string.
    for (const panel of SHEET_PANELS) {
      expect(typeof panel.title).toBe("string");
      expect(panel.title.trim().length).toBeGreaterThan(0);
    }
  });

  describe("panelDefinition", () => {
    it("returns null for an unknown id rather than throwing", () => {
      // `panelId` is state. A restored session, a stale transport button, or a
      // hand-set value can put anything there, and the sheet is not a place to
      // throw during render.
      expect(panelDefinition("nope")).toBeNull();
      expect(panelDefinition(undefined)).toBeNull();
      expect(panelDefinition(null)).toBeNull();
      expect(panelDefinition("")).toBeNull();
      /* Prototype keys are the specific trap: `map.get("constructor")` on a plain
       * object would hand back `Object`, so a truthiness check passes and JSX then
       * renders a function. A Map cannot be walked that way. */
      expect(panelDefinition("constructor")).toBeNull();
      expect(panelDefinition("toString")).toBeNull();
      expect(panelDefinition("__proto__")).toBeNull();
    });

    it("resolves a known id", () => {
      expect(panelDefinition("captions")?.id).toBe("captions");
      expect(panelTitle("speed")).toBe("Playback speed");
    });

    it("keeps the title id and the panel id in step, since both come from the id", () => {
      /* 3.27 added a second id derived from the same panel id, and the sheet now has
       * two: `pv2-sheet-panel-<id>` (the opener's `aria-controls` target) and
       * `pv2-sheet-title-<id>` (the dialog's `aria-labelledby`). They can only drift
       * if one of them stops deriving from the panel id — so the thing to assert is
       * that they are DIFFERENT, because a collision means the dialog's own label
       * resolves to the dialog rather than to its heading, and the accessible name
       * comes back as the entire panel including every row. */
      for (const panel of SHEET_PANELS) {
        expect(panelDomId(panel.id)).not.toBe(`pv2-sheet-title-${panel.id}`);
      }
    });
  });

  describe("nextPanelId", () => {
    it("opens a panel from closed", () => {
      expect(nextPanelId(null, "speed")).toBe("speed");
    });

    it("replaces rather than stacks — the whole point of 3.24", () => {
      // The legacy's defect: pressing a second opener leaves the first panel
      // mounted under the new scrim, unreachable because its rows are behind the
      // backdrop that dismisses the NEWER panel.
      expect(nextPanelId("captions", "speed")).toBe("speed");
      expect(nextPanelId("speed", "captions")).toBe("captions");
    });

    it("closes when the same opener is pressed again", () => {
      // The only dismissal available before 3.25's backdrop and Escape. Without
      // it the sheet is a one-way door for a keyboard viewer.
      expect(nextPanelId("speed", "speed")).toBeNull();
    });

    it("refuses an unknown id and leaves the current panel alone", () => {
      // A control that is not a panel must not blank the sheet: the viewer pressed
      // something, and having the panel they were reading vanish is a worse
      // response than doing nothing.
      expect(nextPanelId("speed", "nope")).toBe("speed");
      expect(nextPanelId(null, "nope")).toBeNull();
      expect(nextPanelId("speed", undefined)).toBe("speed");
      expect(nextPanelId("speed", "constructor")).toBe("speed");
    });
  });

  describe("panelDomId", () => {
    /* 3.27. The id is the whole mechanism, so these are the tests that matter:
     * `aria-controls` is a relationship between two elements in two different files,
     * and each file can only assert its own half. A prefix spelled slightly
     * differently on the two sides produces a reference that resolves to nothing while
     * every unit test passes. */

    it("gives every panel a distinct, prefix-stable id", () => {
      for (const panel of SHEET_PANELS) {
        expect(panelDomId(panel.id)).toBe(`pv2-sheet-panel-${panel.id}`);
      }
      // Distinct, because two panels sharing an id makes the first unreachable by
      // every `aria-controls` in the transport at once.
      const ids = SHEET_PANELS.map((p) => panelDomId(p.id));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("returns null for anything that is not a panel", () => {
      /* `null`, NOT `pv2-sheet-panel-nope`. The callers pass this straight to
       * `aria-controls`, and React renders a null attribute value as the literal text
       * "null" — so an id like that resolves to nothing, which is the exact failure
       * this function exists to prevent, reintroduced at the last step. A test
       * asserting the prefix for an unknown id would bless that bug. */
      expect(panelDomId("nope")).toBeNull();
      expect(panelDomId(undefined)).toBeNull();
      expect(panelDomId(null)).toBeNull();
      expect(panelDomId("")).toBeNull();
      /* Prototype keys again: `BY_ID.has` on a Map cannot be fooled by them. */
      expect(panelDomId("constructor")).toBeNull();
      expect(panelDomId("toString")).toBeNull();
      expect(panelDomId("__proto__")).toBeNull();
    });

    it("covers every opener, so no opener ever names a panel that does not exist", () => {
      /* The drift guard. `SHEET_OPENERS` and `SHEET_PANELS` are two frozen lists in
       * two files that the tests above already keep in agreement — but they agree about
       * TITLES, and this is about ids. An opener added to the transport without a
       * panel gets `aria-controls={null}`, silently, and no existing test notices. */
      for (const opener of SHEET_OPENERS) {
        expect(panelDomId(opener), `opener "${opener}" has no controlled element`).not.toBeNull();
      }
    });
  });
});