import { describe, expect, it } from "vitest";
import {
  describeAudio,
  normalizeAudioTrack,
  audioOptions,
  selectionKind,
} from "../components/player/v2/audioTracks";

/* The audio model is pure, so every decision it makes is assertable without a DOM,
 * an Hls instance, or a browser — which matters because the two hardest cases
 * (Safari native HLS, and sibling-URL dubs) cannot both be reached from one mount.
 */

const hlsTrack = (over = {}) => ({
  index: 0,
  id: 0,
  name: "",
  lang: "",
  groupId: "aac",
  default: false,
  characteristics: [],
  ...over,
});

describe("normalizeAudioTrack", () => {
  it("keys by engine index, not by id", () => {
    /* Two entries sharing an id at different positions are two real choices.
     * Keying by id would collapse them into one React row and lose one. */
    const a = normalizeAudioTrack(hlsTrack({ index: 0, id: 7, name: "English" }), 0);
    const b = normalizeAudioTrack(hlsTrack({ index: 1, id: 7, name: "English" }), 1);
    expect(a.index).toBe(0);
    expect(b.index).toBe(1);
    expect(a.id).not.toBe(b.id);
  });

  it("falls back to the array position when the track carries no index", () => {
    expect(normalizeAudioTrack(hlsTrack({ index: undefined, name: "Tamil" }), 4).index).toBe(4);
  });

  it("prefers a manifest name over the code it would have to guess at", () => {
    expect(normalizeAudioTrack(hlsTrack({ name: "English Commentary", lang: "en" }), 0).label)
      .toBe("English Commentary");
  });

  it("spells out a known bare code rather than showing it raw", () => {
    expect(normalizeAudioTrack(hlsTrack({ lang: "und" }), 0).label).toBe("Unknown");
    expect(normalizeAudioTrack(hlsTrack({ lang: "mul" }), 0).label).toBe("Multitrack");
  });

  it("uppercases a code it has no name for, so the row is not blank", () => {
    expect(normalizeAudioTrack(hlsTrack({ lang: "ta" }), 0).label).toBe("TA");
  });

  it("does NOT blame the source when there was no engine to ask", () => {
    /* Native-HLS mode (Safari): no hls.js exists, so nothing was read. Saying "this
     * source carries one soundtrack" is a claim we cannot support and it is how
     * "Safari can't dub" becomes a bug report about missing audio. The honest
     * sentence says we could not ask. */
    const native = describeAudio([], { engineAttached: false });
    expect(native.note).not.toMatch(/carries one soundtrack/i);
    expect(native.note).toMatch(/could|needs|cannot|directly/i);

    const attached = describeAudio([], { engineAttached: true });
    expect(attached.note).toMatch(/carries one soundtrack/i);
  });

  it("rejects a track with nothing to label, rather than rendering a blank row", () => {
    expect(normalizeAudioTrack(hlsTrack({ name: "", lang: "" }), 0)).toBeNull();
    expect(normalizeAudioTrack(null, 0)).toBeNull();
  });

  it("keeps characteristics, which is the only place a description track announces itself", () => {
    const t = normalizeAudioTrack(
      hlsTrack({ name: "English", characteristics: ["public.accessibility.describes-video"] }),
      0,
    );
    expect(t.characteristics).toEqual(["public.accessibility.describes-video"]);
  });
});

describe("describeAudio", () => {
  it("reports a single soundtrack when the manifest declares no audio groups", () => {
    /* The case that matters most. hls.js reports [] and the only audio is in the
     * video. This must NOT be an empty panel (reads as a missing feature) and must
     * NOT be a selectable row (a lie about a control that does nothing). */
    const audio = describeAudio([]);
    expect(audio.kind).toBe(selectionKind.SINGLE);
    expect(audio.tracks).toEqual([]);
    expect(audio.selectedIndex).toBeNull();
    expect(audio.selectable).toBe(false);
    expect(audio.note).toMatch(/one soundtrack/i);
  });

  it("treats undefined and non-array track lists as the single-track case", () => {
    for (const input of [undefined, null, "nope", {}]) {
      expect(describeAudio(input).kind).toBe(selectionKind.SINGLE);
    }
  });

  it("is not selectable with exactly one rendition", () => {
    /* A radiogroup of one advertises a choice that does not exist and invites arrow
     * keys that have nowhere to go. */
    const audio = describeAudio([hlsTrack({ name: "English" })], { currentIndex: 0 });
    expect(audio.kind).toBe(selectionKind.TRACKS);
    expect(audio.tracks).toHaveLength(1);
    expect(audio.selectable).toBe(false);
    expect(audioOptions(audio)).toBeNull();
  });

  it("is selectable with two, and reports the engine's own index", () => {
    const audio = describeAudio(
      [hlsTrack({ index: 0, name: "English" }), hlsTrack({ index: 1, name: "Tamil" })],
      { currentIndex: 1 },
    );
    expect(audio.selectable).toBe(true);
    expect(audio.selectedIndex).toBe(1);
    expect(audioOptions(audio).options.find((o) => o.selected).title).toBe("Tamil");
  });

  it("resolves the selection through the ENGINE index, not the deduped position", () => {
    /* This is the bug the dedupe would otherwise cause. hls.js's index addresses
     * its own list; ours is shorter. If the selected row were looked up by position
     * in the deduped array, the wrong track would show as playing. */
    const audio = describeAudio(
      [
        hlsTrack({ index: 0, name: "English" }),
        hlsTrack({ index: 1, name: "English" }), // duplicate label, same group
        hlsTrack({ index: 2, name: "Tamil" }),
      ],
      { currentIndex: 2 },
    );
    expect(audio.tracks.map((t) => t.label)).toEqual(["English", "Tamil"]);
    expect(audio.selectedIndex).toBe(2);
    expect(audioOptions(audio).options.find((o) => o.selected).title).toBe("Tamil");
  });

  it("dedupes same-label renditions but keeps genuinely different ones", () => {
    const audio = describeAudio([
      hlsTrack({ index: 0, name: "English" }),
      hlsTrack({ index: 1, name: "English" }),
      hlsTrack({ index: 2, name: "English (Director's Commentary)" }),
    ]);
    expect(audio.tracks.map((t) => t.label)).toEqual([
      "English",
      "English (Director's Commentary)",
    ]);
  });

  it("prefers the manifest default when a duplicate label is not marked default", () => {
    /* Otherwise the winner is whichever the provider happened to list first. */
    const audio = describeAudio([
      hlsTrack({ index: 0, name: "English" }),
      hlsTrack({ index: 1, name: "English", default: true }),
    ]);
    expect(audio.tracks).toHaveLength(1);
    expect(audio.tracks[0].index).toBe(1);
  });

  it("does not report the manifest-default sentinel as the selected track", () => {
    /* hls.js uses -1 for "follow the manifest". It is a real state but it is not a
     * track: rendering it as the selection would show nothing checked while audio
     * plays. */
    const audio = describeAudio(
      [hlsTrack({ index: 0, name: "English" }), hlsTrack({ index: 1, name: "Tamil" })],
      { currentIndex: -1 },
    );
    expect(audio.selectedIndex).not.toBe(-1);
    expect(audio.tracks.some((t) => t.index === audio.selectedIndex)).toBe(true);
  });

  it("falls back to the default rendition when the engine index is unknown", () => {
    const audio = describeAudio(
      [hlsTrack({ index: 0, name: "English" }), hlsTrack({ index: 1, name: "Tamil" })],
      { currentIndex: 99 },
    );
    expect(audio.selectedIndex).toBe(0);
  });
});

describe("audioOptions", () => {
  it("does NOT dedupe a main mix into an audio-description track of the same name", () => {
    /* Both are named "English". They are not duplicates: a viewer who cannot see the
     * screen needs to be able to choose the described one. Dedupe keying on the label
     * alone collapsed them and hid the description track — the worst outcome for the
     * viewer who most needs it. This test is why the key includes characteristics. */
    const audio = describeAudio([
      hlsTrack({ index: 0, name: "English", lang: "en" }),
      hlsTrack({
        index: 1,
        name: "English",
        lang: "en",
        characteristics: ["public.accessibility.describes-video"],
      }),
    ]);
    expect(audio.tracks).toHaveLength(2);
    const options = audioOptions(audio);
    expect(options).not.toBeNull();
    expect(options.options).toHaveLength(2);
    /* Titles are identical, so the distinction has to live in the sub line — which
     * is why the title alone is not enough to identify a track. */
    expect(options.options.map((o) => o.sub)).toEqual([
      "EN",
      "EN · public.accessibility.describes-video",
    ]);
  });

  it("still dedupes a genuine repeat of the SAME rendition", () => {
    /* Same label AND same characteristics is the provider listing one rendition
     * once per audio group. That is a real duplicate and must collapse. */
    const audio = describeAudio([
      hlsTrack({ index: 0, name: "English", groupId: "aac" }),
      hlsTrack({ index: 1, name: "English", groupId: "aac" }),
      hlsTrack({ index: 2, name: "Tamil", groupId: "aac" }),
    ]);
    expect(audio.tracks.map((t) => t.label)).toEqual(["English", "Tamil"]);
  });

  it("keeps distinct renditions that happen to share a name", () => {
    const audio = describeAudio([
      hlsTrack({ index: 0, name: "English" }),
      hlsTrack({ index: 1, name: "English (Director's Commentary)" }),
    ]);
    expect(audio.tracks.map((t) => t.label)).toEqual([
      "English",
      "English (Director's Commentary)",
    ]);
  });

  it("carries the engine index on each option so the caller never re-looks-it-up", () => {
    const audio = describeAudio([
      hlsTrack({ index: 0, name: "English" }),
      hlsTrack({ index: 3, name: "Tamil" }),
    ]);
    const options = audioOptions(audio);
    expect(options.options.find((o) => o.title === "Tamil").index).toBe(3);
  });

  it("returns null for anything that is not a real choice", () => {
    expect(audioOptions(null)).toBeNull();
    expect(audioOptions(describeAudio([]))).toBeNull();
    expect(audioOptions(describeAudio([hlsTrack({ name: "English" })]))).toBeNull();
  });
});