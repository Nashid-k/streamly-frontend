import { describe, expect, it } from "vitest";
import { buildAudioTrackList, normalizeAudioLabel, originalTrackLabel } from "../utils/audioLabels";

// The provider strings that motivated this file, copied verbatim from the
// shapes api/downloadify.js passes through (ZXC `lanName`, NHD `label`).
const ZXC_ROWS = [
  { label: "Tamil Dub" },
  { label: "Hindi Dub" },
  { label: "English Dub" },
  { label: "Telugu" },
];

describe("normalizeAudioLabel", () => {
  it("drops the word 'Dub' from a ZXC label", () => {
    expect(normalizeAudioLabel("Tamil Dub")).toBe("Tamil");
    expect(normalizeAudioLabel("Hindi Dub")).toBe("Hindi");
  });

  it("drops 'Audio', 'Track' and 'Version' noise too", () => {
    expect(normalizeAudioLabel("Korean Audio")).toBe("Korean");
    expect(normalizeAudioLabel("French Audio Track")).toBe("French");
    expect(normalizeAudioLabel("Spanish Version")).toBe("Spanish");
  });

  it("unpacks the underscore/dash form several providers use", () => {
    expect(normalizeAudioLabel("TAMIL_AUDIO")).toBe("Tamil");
    expect(normalizeAudioLabel("portuguese-dub")).toBe("Portuguese");
  });

  it("leaves a clean language name alone", () => {
    expect(normalizeAudioLabel("Tamil")).toBe("Tamil");
    expect(normalizeAudioLabel("Telugu")).toBe("Telugu");
  });

  it("does not mangle a language that merely contains a noise word", () => {
    // 'Audio' must never be found inside a language name, which is why the
    // pattern is word-bounded.
    expect(normalizeAudioLabel("Azerbaijani")).toBe("Azerbaijani");
    expect(normalizeAudioLabel("Original Audio")).toBe("Original");
  });

  it("returns empty for nothing usable rather than throwing", () => {
    expect(normalizeAudioLabel(null)).toBe("");
    expect(normalizeAudioLabel(undefined)).toBe("");
    expect(normalizeAudioLabel("")).toBe("");
    expect(normalizeAudioLabel("   ")).toBe("");
    // A row that is ONLY noise has no language left to show.
    expect(normalizeAudioLabel("Dub")).toBe("");
  });
});

describe("originalTrackLabel", () => {
  it("names the film's actual language instead of saying 'Original'", () => {
    expect(originalTrackLabel("en")).toBe("English");
    expect(originalTrackLabel("ta")).toBe("Tamil");
    expect(originalTrackLabel("hi")).toBe("Hindi");
  });

  it("falls back to 'Original' when TMDB gave no language", () => {
    // A guess here would be a lie about the soundtrack we are actually playing.
    expect(originalTrackLabel(null)).toBe("Original");
    expect(originalTrackLabel("")).toBe("Original");
  });

  it("survives a language it has no name for", () => {
    expect(originalTrackLabel("qqq")).toBe("qqq");
    expect(originalTrackLabel("ab")).toBe("AB");
  });
});

describe("buildAudioTrackList", () => {
  it("puts the original first, named by language, with no 'Dub' anywhere", () => {
    const list = buildAudioTrackList(ZXC_ROWS, "en");
    expect(list[0]).toEqual({ label: "English", isOriginal: true, sourceIndex: null });
    // "English Dub" is the SAME language as the original row, so it is folded
    // away rather than listed twice â€” the remaining rows are the real dubs.
    expect(list.map((r) => r.label)).toEqual(["English", "Tamil", "Hindi", "Telugu"]);
    expect(list.every((r) => !/dub/i.test(r.label))).toBe(true);
  });

  it("drops a dub row that duplicates the original language", () => {
    // The provider listing "English Dub" beside our own "English" row is noise.
    const list = buildAudioTrackList([{ label: "English Dub" }], "en");
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("English");
  });

  it("still lists an original when the provider has no matching dub for it", () => {
    const list = buildAudioTrackList([{ label: "Tamil Dub" }], "en");
    expect(list.map((r) => r.label)).toEqual(["English", "Tamil"]);
  });

  it("returns just the original when a server has no dubs at all", () => {
    const single = [{ label: "English", isOriginal: true, sourceIndex: null }];
    expect(buildAudioTrackList([], "en")).toEqual(single);
    expect(buildAudioTrackList(undefined, null)).toEqual([
      { label: "Original", isOriginal: true, sourceIndex: null },
    ]);
  });

  it("de-dupes two rows that normalise to the same language", () => {
    // "Tamil Dub" and "Tamil Audio" are the same language; showing both would
    // make a viewer think the source had two Tamil tracks.
    const list = buildAudioTrackList([{ label: "Tamil Dub" }, { label: "Tamil Audio" }], "en");
    expect(list.map((r) => r.label)).toEqual(["English", "Tamil"]);
  });

  it("skips rows that normalise to nothing instead of showing a blank", () => {
    const list = buildAudioTrackList([{ label: "Dub" }, { label: "  " }, { label: "Hindi Dub" }], "en");
    expect(list.map((r) => r.label)).toEqual(["English", "Hindi"]);
  });

  it("keeps sourceIndex pointing at the real dub after a row is dropped", () => {
    /* Regression: rows are dropped (index 0 "Dub" normalises to nothing), so a
       row's POSITION in the built list is no longer its index in the provider's
       array. The player switches with sourceIndex + 1; using the row's own
       position would play "Hindi" when the viewer clicked "Tamil". */
    const list = buildAudioTrackList(
      [{ label: "Dub" }, { label: "Tamil Dub" }, { label: "Hindi Dub" }],
      "en",
    );
    expect(list.map((r) => r.label)).toEqual(["English", "Tamil", "Hindi"]);
    expect(list.map((r) => r.sourceIndex)).toEqual([null, 1, 2]);
  });

  it("marks only the first row original and gives it no source index", () => {
    const list = buildAudioTrackList([{ label: "Tamil Dub" }], "en");
    expect(list.filter((r) => r.isOriginal)).toHaveLength(1);
    expect(list[0].sourceIndex).toBeNull();
    expect(list[1].isOriginal).toBe(false);
  });
});
