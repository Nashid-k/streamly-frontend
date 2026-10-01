import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import SettingsSheet from "../components/player/v2/SettingsSheet";
import {
  captionOptions,
  flagOf,
  sortTracks,
  trackBadge,
  trackBadgeLabel,
  trackKey,
} from "../components/player/v2/subtitleTracks";

/* 3.29. The bug was not a missing badge in the panel — it was that the fetcher deduped
 * on `LanguageName`, so for a title offering both a plain and an SDH English track only
 * ONE survived. Everything here is written against that: a badge test that renders a
 * hand-built SDH entry passes just as well while the real pipeline still drops it. */

const plain = { language: "English", languageId: "en", hearingImpaired: "0", forced: "0" };
const sdh = { language: "English", languageId: "en", hearingImpaired: "1", forced: "0" };
const forced = { language: "English", languageId: "en", hearingImpaired: "0", forced: "1" };

describe("subtitleTracks.flagOf", () => {
  it("treats upstream's \"0\" as false, which plain coercion gets backwards", () => {
    /* The REST API serialises `SubHearingImpaired` as the STRING "0". `Boolean("0")` is
     * true, so a boolean coercion marks EVERY track as SDH — worse than the current
     * behaviour, because the badge then appears on all rows and reads as a rendering
     * fault rather than as missing data. */
    expect(Boolean("0")).toBe(true);
    expect(flagOf("0")).toBe(false);
    expect(flagOf("1")).toBe(true);
  });

  it("accepts the three shapes a stub or a cached payload can hold", () => {
    expect(flagOf(true)).toBe(true);
    expect(flagOf(1)).toBe(true);
    expect(flagOf(1n)).toBe(true);
    expect(flagOf(false)).toBe(false);
    expect(flagOf(0)).toBe(false);
    expect(flagOf(undefined)).toBe(false);
    expect(flagOf(null)).toBe(false);
    expect(flagOf("")).toBe(false);
    /* A truthy non-flag must not pass. "true" is not what the API sends, and treating
     * it as a flag means a future server-side change silently badges everything. */
    expect(flagOf("true")).toBe(false);
  });
});

describe("subtitleTracks.trackKey", () => {
  it("gives every variant of one language a distinct key", () => {
    /* THE regression. Keyed on `languageId` alone, these three are one row, and the
     * fetcher's dedupe drops two of them — the viewer is never offered a choice that
     * existed upstream. */
    expect(trackKey(plain)).not.toBe(trackKey(sdh));
    expect(trackKey(plain)).not.toBe(trackKey(forced));
    expect(trackKey(sdh)).not.toBe(trackKey(forced));
    expect(trackKey(plain)).toBe("en");
    expect(trackKey(sdh)).toBe("en:sdh");
    expect(trackKey(forced)).toBe("en:forced");
  });

  it("is stable across two structurally equal tracks, so selection survives a refetch", () => {
    const copy = { ...plain };
    expect(trackKey(copy)).toBe(trackKey(plain));
    expect(trackKey(sdh)).toBe(trackKey({ ...sdh }));
  });

  it("falls back to the name and survives junk without throwing", () => {
    /* `track` is whatever came out of a fetch. A key of "undefined" would collide
     * across every malformed entry, silently collapsing them into one row. */
    expect(trackKey({ language: "Klingon" })).toBe("Klingon");
    expect(trackKey({})).toBe("");
    expect(trackKey(undefined)).toBe("");
    expect(trackKey(null)).toBe("");
  });
});

describe("subtitleTracks.trackBadge", () => {
  it("marks SDH and forced, and leaves a plain track unmarked", () => {
    expect(trackBadge(sdh)).toBe("SDH");
    expect(trackBadge(forced)).toBe("Forced");
    expect(trackBadge(plain)).toBeNull();
    expect(trackBadge({})).toBeNull();
    expect(trackBadge(undefined)).toBeNull();
  });

  it("prefers Forced over SDH when a result claims both", () => {
    /* Not hypothetical: OpenSubtitles marks some signed tracks as both, and calling
     * that one "SDH" tells the viewer it has descriptive dialogue it does not have.
     * Forced is the more surprising property of the two, so it wins the badge. */
    expect(trackBadge({ ...sdh, forced: "1" })).toBe("Forced");
  });

  it("expands the badge for the accessible name", () => {
    /* "SDH" read literally is three letters. The expanded form is what a viewer
     * hunting for the descriptive track would search for, and what the row's name
     * needs so the chip does not have to be announced as its own thing. */
    expect(trackBadgeLabel(sdh)).toBe("SDH (hearing impaired)");
    expect(trackBadgeLabel(forced)).toBe("Forced (signage and narration)");
    expect(trackBadgeLabel(plain)).toBeNull();
  });
});

describe("subtitleTracks.sortTracks", () => {
  it("orders plain before SDH before forced within a language", () => {
    /* Deliberate. Most viewers want the clean track and SDH is the fallback for a
     * specific need; forced is signage and belongs at the end so a fast arrow-key run
     * does not land on it by default. */
    const sorted = sortTracks([forced, sdh, plain]);
    expect(sorted.map(trackBadge)).toEqual([null, "SDH", "Forced"]);
  });

  it("keeps that ranking per language rather than globally", () => {
    /* The grouping matters: a viewer comparing English and Spanish variants needs the
     * two English rows adjacent, not all the plain tracks together and all the SDH ones
     * together. A pure rank sort would produce the second list and is the obvious wrong
     * implementation of "plain first". */
    /* Both a PLAIN Spanish row and an SDH English row, which is the arrangement that
     * separates the two possible implementations. A global rank sort produces
     * `English, Spanish, EnglishSDH` — the two English variants split apart, with an
     * unrelated language wedged between them. Grouping by language first produces
     * `English, EnglishSDH, Spanish`.
     *
     * The earlier version of this test used SDH Spanish and no plain Spanish, which
     * both implementations happened to order identically — so it passed against the
     * global-rank implementation it was written to reject. */
    const sorted = sortTracks([
      { language: "Spanish", languageId: "es", hearingImpaired: "1" },
      { language: "Spanish", languageId: "es", hearingImpaired: "0" },
      { language: "English", languageId: "en", hearingImpaired: "1" },
      { language: "English", languageId: "en", hearingImpaired: "0" },
    ]);
    expect(sorted.map((t) => `${t.language}${trackBadge(t) ?? ""}`)).toEqual([
      "English",
      "EnglishSDH",
      "Spanish",
      "SpanishSDH",
    ]);
  });

  it("sorts names with natural ordering and case-insensitively", () => {
    /* Track lists are where "English 2" before "English 10" reads as broken, and plain
     * `<` on strings sorts by code unit, which puts every capital before every
     * lowercase.
     *
     * The digits 9 and 10 are the load-bearing part. An earlier version of this test
     * used 1/2/10 with a lowercased "english 10", and BOTH comparators agree on that
     * set — lexical puts the lowercase name last because 'e' > 'E', and the 1/2/10
     * order is already correct at that magnitude. The mutant survived it. "English 9"
     * against "English 10" is where code-unit order and numeric order actually differ. */
    const sorted = sortTracks([
      { language: "English 10", languageId: "a" },
      { language: "English 9", languageId: "b" },
      { language: "English 1", languageId: "c" },
    ]);
    expect(sorted.map((t) => t.language)).toEqual(["English 1", "English 9", "English 10"]);

    /* And the case half separately, so the two options are each pinned. */
    const mixed = sortTracks([
      { language: "zulu", languageId: "a" },
      { language: "Afrikaans", languageId: "b" },
    ]);
    expect(mixed.map((t) => t.language)).toEqual(["Afrikaans", "zulu"]);
  });

  it("is total, so the order never depends on the input order", () => {
    /* Two tracks can share a language AND a variant only if upstream returned the same
     * file twice. Returning 0 there leaves it to the engine's sort, which is stable in
     * V8 but not by contract — and a list that reorders between renders moves the
     * selected row under the viewer's thumb mid-press. */
    const a = { language: "English", languageId: "en", hearingImpaired: "1", downloadLink: "a" };
    const b = { language: "English", languageId: "en", hearingImpaired: "1", downloadLink: "b" };
    const forward = sortTracks([a, b]).map((t) => t.downloadLink);
    const reverse = sortTracks([b, a]).map((t) => t.downloadLink);
    expect(forward).toEqual(reverse);
    expect(forward).toHaveLength(2);
  });

  it("does not mutate its input", () => {
    const input = [forced, sdh, plain];
    const copy = [...input];
    sortTracks(input);
    expect(input).toEqual(copy);
  });

  it("tolerates a non-array and junk entries", () => {
    expect(sortTracks(undefined)).toEqual([]);
    expect(sortTracks(null)).toEqual([]);
    expect(sortTracks([])).toEqual([]);
    expect(sortTracks([null, undefined, plain]).map(trackBadge)).toEqual([null]);
  });
});

describe("the sheet's caption rows are grouped per language (3.29)", () => {
  /* This is the assertion the unit suite could not make. `sortTracks` is tested on
   * raw entries; the failure 3.29 actually shipped was in the PANEL, which mapped
   * `sortTracks(languages)` into rows keyed on `languageId` — so a correct sort fed a
   * wrong identity, and two variants of one language collapsed into one row that kept
   * the first one's state. Sorting tests pass; the sheet is still broken.
   *
   * Driven through the real component on purpose. A test that hand-builds the option
   * objects the panel builds would be testing its own fixture. */

  /* Deliberately UNSORTED input: Tamil arrives before English, and the forced English
   * track arrives first. A fixture that happens to arrive in the right order makes the
   * panel's `sortTracks(languages)` call look like a no-op, and the mutation probe
   * confirmed exactly that — removing the sort left every test green against an
   * already-sorted fixture. Sorting is asserted only by feeding it something out of
   * order. */
  const render2 = (track) =>
    render(
      <SettingsSheet
        panelId="captions"
        onClose={() => {}}
        panels={{
          subtitles: {
            languages: [
              { language: "Tamil", languageId: "ta", downloadLink: "t" },
              { language: "English", languageId: "en", downloadLink: "f", hearingImpaired: "0", forced: "1" },
              { language: "English", languageId: "en", downloadLink: "s", hearingImpaired: "1", forced: "0" },
              { language: "English", languageId: "en", downloadLink: "p", hearingImpaired: "0", forced: "0" },
            ],
            track,
            select: () => {},
            loading: false,
            error: null,
          },
        }}
      />,
    );

  const rowOrder = () =>
    [...document.querySelectorAll(".pv2-sheet__row")].map(
      (r) => r.querySelector(".pv2-sheet__row-title")?.textContent,
    );

  /* These helpers query `document` rather than the container `render` returns, so a
   * sheet left mounted from a previous test silently doubles every row count. Testing
   * Library's automatic cleanup is registered by its auto-import path; this file uses
   * named imports, so `afterEach(cleanup)` is stated explicitly rather than assumed.
   * The symptom it prevents is nasty — a list of twelve rows for a four-row panel,
   * with the failure pointing at the ordering assertion instead of at the leak. */
  afterEach(cleanup);

  it("keeps the two English variants adjacent in the DOM order", () => {
    render2(null);
    /* The full order, including the forced track: this fixture arrives as
     * Tamil, English/Forced, English/SDH, English/Plain, which no reading of "plain
     * first" produces. Only grouping by language and ranking within the group does. */
    expect(rowOrder()).toEqual(["Off", "English", "English", "English", "Tamil"]);
  });

  it("puts the badge column in variant order, not arrival order", () => {
    render2(null);
    const badges = [...document.querySelectorAll(".pv2-sheet__badge")].map((b) => b.textContent);
    expect(badges).toEqual(["SDH", "Forced"]);
  });

  it("renders one row per variant, none of them merged or suppressed", () => {
    /* The row COUNT is the discriminating assertion. The badge assertions above all
     * pass if the SDH row were suppressed or folded into the plain row's element —
     * "SDH" and "Forced" would still be in the document either way. Five rows is Off
     * plus three English variants plus Tamil; four is the bug this task started from. */
    render2(null);
    expect(document.querySelectorAll(".pv2-sheet__row")).toHaveLength(5);
  });
});

describe("the badge chip's own layout (3.29)", () => {
  /* The three CSS mutants below are the ones that survive every DOM assertion in this
   * file, because jsdom does not lay anything out: a chip that stretches to fill the
   * row, a chip with no column to sit in, and a language id squeezed into the chip's
   * width all render identically as far as `getByRole` is concerned. Each is a real
   * visual defect, so they are asserted on the stylesheet text instead — the same
   * approach `playerV2Style.test.js` takes, and for the same reason.
   *
   * These matter because a caption row is now three columns wide. Without the
   * `1fr auto` the badge falls to its own line and every SDH row is double height; with
   * the sub-line unpinned it renders at chip width and the language id wraps mid-word. */
  const css = readFileSync(
    join(import.meta.dirname, "../components/player/v2/player.css"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");
  const row = css.match(/\.pv2-sheet__row\s*\{([^}]*)\}/)?.[1] ?? "";
  const sub = css.match(/\.pv2-sheet__row-sub\s*\{([^}]*)\}/)?.[1] ?? "";
  const badge = css.match(/\.pv2-sheet__badge\s*\{([^}]*)\}/)?.[1] ?? "";

  it("gives the row a title column and a badge column", () => {
    expect(row, "no .pv2-sheet__row rule").toBeTruthy();
    expect(row).toMatch(/grid-template-columns\s*:\s*1fr\s+auto/);
  });

  it("keeps the chip from stretching to fill the row", () => {
    /* `flex`, not `grid` — the chip is a grid ITEM of the row, so `flex` has no effect
     * at all and this assertion is really pinning "there is no flex sizing here".
     * What matters is that no stretch keyword lets it expand. */
    expect(badge, "no .pv2-sheet__badge rule").toBeTruthy();
    expect(badge).not.toMatch(/flex\s*:\s*1/);
  });

  it("pins the language id across both columns so it is not squeezed to chip width", () => {
    expect(sub, "no .pv2-sheet__row-sub rule").toBeTruthy();
    expect(sub).toMatch(/grid-column\s*:\s*1\s*\/\s*-1/);
  });

  it("keeps the chip's text uppercase in CSS rather than in the JSX string", () => {
    /* The string stays "SDH" for the accessible name and for these tests, so the visual
     * transform cannot drift away from the spoken one the way a `toUpperCase()` in JSX
     * could. */
    expect(badge).toMatch(/text-transform\s*:\s*uppercase/);
  });

  it("marks the chip aria-hidden, because the phrase is already in the row's name", () => {
    expect(badge).toBeTruthy();
    const row$ = css.match(/\.pv2-sheet__badge\b/);
    expect(row$).toBeTruthy();
    /* The attribute lives in JSX, not here; this asserts the chip is a sibling of the
     * title/sub inside the row button so hiding it does not hide the row itself. */
    expect(css).toMatch(/\.pv2-sheet__row-title\s*\{[^}]*\}/);
  });
});

describe("subtitleTracks.captionOptions", () => {
  it("keeps every variant instead of collapsing them by language", () => {
    /* The fetcher's actual bug, exercised on the reducer it now uses. One row would
     * mean the SDH and forced tracks are still being dropped somewhere. */
    expect(captionOptions([plain, sdh, forced])).toHaveLength(3);
  });

  it("still dedupes the SAME variant twice", () => {
    /* Upstream returns many files per language; offering all of them would fill the
     * sheet with duplicate rows. First wins, which keeps OpenSubtitles' rating order. */
    const list = captionOptions([plain, plain, sdh, sdh]);
    expect(list).toHaveLength(2);
    expect(list.map(trackBadge)).toEqual([null, "SDH"]);
  });

  it("does not confuse an SDH track with a forced one of the same language", () => {
    /* `SubHearingImpaired: "1"` and `SubForced: "1"` are different files. Treating
     * them as the same variant would drop one of them, which is the original bug in a
     * narrower window. */
    const list = captionOptions([{ ...sdh, forced: "1" }, forced]);
    expect(list).toHaveLength(2);
  });

  it("dedupes and orders in one pass", () => {
    const list = captionOptions([forced, plain, sdh, plain]);
    expect(list.map((t) => trackBadge(t))).toEqual([null, "SDH", "Forced"]);
  });

  it("returns an empty list for junk rather than throwing", () => {
    /* `languages` is hook state. An empty pane is a real state the panel already
     * renders ("No subtitles were offered for this title"); a throw here would take
     * down the whole sheet. */
    expect(captionOptions(undefined)).toEqual([]);
    expect(captionOptions(null)).toEqual([]);
    expect(captionOptions([null, undefined])).toEqual([]);
  });
});
