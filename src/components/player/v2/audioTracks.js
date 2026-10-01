/**
 * Audio track model for the settings sheet (task.md R4.1).
 *
 * ── Why this is a module and not a panel ──────────────────────────────────────
 * Everything here is a pure function over data hls.js already parsed. The panel
 * renders; the decisions — what counts as a track, what the viewer's language is,
 * whether a label is honest, whether a row can be selected — are all answerable
 * without a DOM element, an Hls instance, or React. That makes them assertable in
 * jsdom, which is the only place correctness can be proven here.
 *
 * ── The two mechanisms this must cover ────────────────────────────────────────
 * A source can carry alternate audio two unrelated ways, and they are NOT
 * interchangeable:
 *
 *   1. In-manifest `#EXT-X-MEDIA:TYPE=AUDIO` groups. hls.js exposes these as
 *      `hls.audioTracks`, and switching is a property write:
 *      `hls.audioTrack = index`. The manifest, playlist and segment structure are
 *      untouched — only which audio rendition the demuxer selects changes. Cheap.
 *
 *   2. Sibling-URL dubs, where each dub is a SEPARATE full-stream manifest (this is
 *      what the NHD backend returns as `audioTracks`). There is no in-manifest group
 *      to select, so "switching audio" means swapping the SOURCE URL and preserving
 *      playback position. That is a different operation entirely.
 *
 * Conflating them is the bug this module exists to prevent: a panel that writes
 * `hls.audioTrack` for a sibling-URL dub silently does nothing, because there is no
 * audio group to select. `selectionKind` tells the caller which operation it is
 * holding, so the shell can pick the right one.
 *
 * ── The single-track case is the important one ────────────────────────────────
 * When a manifest declares no audio groups, hls.js reports an EMPTY track list and
 * the only audio is whatever is in the video. Rendering that as an empty panel says
 * "there is nothing here", which reads as a missing feature. Rendering it as a
 * selectable row says something false. So it is a distinct state:
 * `describeAudio` returns `kind: "single"`, and the panel renders it as a
 * read-only label with NO radio semantics — it is a fact about the source, not an
 * option the viewer can change.
 */

/** How a selection has to be applied for these tracks. */
export const selectionKind = Object.freeze({
  /** No alternate audio: nothing to choose, and nothing to switch to. */
  SINGLE: "single",
  /** In-manifest audio groups: write `hls.audioTrack`. */
  TRACKS: "tracks",
});

/**
 * Language names for codes hls.js reports but does not spell out.
 *
 * hls.js gives `lang` from the manifest, which is often a bare ISO code and
 * sometimes an empty string. An empty language is NOT a reason to hide the track:
 * "Unknown" is a worse label than no label only when the name is actually
 * present. So this is a last resort, and `normalizeAudioTrack` prefers any real
 * upstream name over it.
 */
const LANG_NAMES = Object.freeze({
  und: "Unknown",
  mul: "Multitrack",
  zxx: "No dialogue",
});

/**
 * One playable audio track, normalized.
 *
 * @param {object} track an entry from `hls.audioTracks`
 * @returns {{index: number, id: string, name: string, lang: string,
 *            label: string, groupId: string, default: boolean,
 *            characteristics: string[]}|null}
 */
export function normalizeAudioTrack(track, index) {
  if (!track) return null;
  /* hls.js indexes by position, but a track can also carry `id`. Position is the
   * only thing `hls.audioTrack` accepts, so it is the identity we key on: two
   * entries with the same id at different positions are genuinely different
   * choices, and React must not collapse them onto one key. */
  const at = Number.isInteger(track.index) ? track.index : index;
  if (!Number.isInteger(at) || at < 0) return null;

  const lang = String(track.lang || "").trim();
  const name = String(track.name || "").trim();
  /* A manifest that names the track wins over a code we would have to guess at.
   * "English Commentary" says more than "en"; "en" says more than "Unknown". */
  const langName = LANG_NAMES[lang.toLowerCase()] || "";
  const label = name || (lang ? langName || lang.toUpperCase() : langName);

  if (!label) return null;

  return {
    index: at,
    /* Keyed by index because that is the addressable thing; see the note above. */
    id: `track-${at}`,
    name,
    lang,
    label,
    groupId: String(track.groupId ?? ""),
    default: Boolean(track.default),
    /* `characteristics` carries things like "public.accessibility.describes-video".
     * Surfaced verbatim in the sub line: it is the only place a viewer can learn
     * that a track is a description track rather than the main mix. */
    characteristics: Array.isArray(track.characteristics)
      ? track.characteristics.map((c) => String(c)).filter(Boolean)
      : [],
  };
}

/**
 * The full audio model for a source.
 *
 * @param {object[]} tracks `hls.audioTracks`, possibly undefined
 * @param {object} [opts]
 * @param {number} [opts.currentIndex] `hls.audioTrack` right now
 * @param {boolean} [opts.engineAttached] false in native-HLS mode, where the
 *   browser plays the stream and there is no hls.js to ask or to write to
 * @returns {{kind: string, tracks: object[], selectedIndex: number|null,
 *            selectable: boolean, note: string|null}}
 */
export function describeAudio(tracks, opts = {}) {
  const { currentIndex, engineAttached = true } = opts;

  const normalized = (Array.isArray(tracks) ? tracks : [])
    .map(normalizeAudioTrack)
    .filter(Boolean);

  /* Dedupe on label PLUS characteristics, not label alone. Some providers emit the
   * same rendition twice (once per audio group it appears in) — that is a real
   * duplicate and must collapse. But a main mix and an audio-description track
   * routinely share one name, and they are NOT duplicates: a viewer who cannot see
   * the screen needs to be able to pick the described one. Keying on the label
   * alone collapsed them and hid the description track entirely, which is the worst
   * possible outcome for the viewer who most needs it. */
  const keyOf = (track) => `${track.label}|${track.characteristics.join("+")}`;
  const byKey = new Map();
  for (const track of normalized) {
    const key = keyOf(track);
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, track);
    } else if (!existing.default && track.default) {
      /* Prefer the rendition the manifest marks default when the same label
       * appears twice — otherwise the first one listed wins by accident. */
      byKey.set(key, track);
    }
  }
  const list = Array.from(byKey.values());

  if (list.length === 0) {
    return {
      kind: selectionKind.SINGLE,
      tracks: [],
      selectedIndex: null,
      /* No in-manifest groups, so nothing to select. NOT the same as "engine
       * cannot do it": the audio exists and is playing, it just has no siblings. */
      selectable: false,
      /* The two empty-list cases need different words, and conflating them is how
       * "Safari can't dub" turns into a bug report about missing audio. With an
       * engine we KNOW the manifest declared no alternates. With no engine
       * (native-HLS mode) the browser is playing whatever is in the stream and
       * nothing exposed the alternatives, so the honest answer is that we could not
       * ask — not that there are none. */
      note: engineAttached
        ? "This source carries one soundtrack."
        : "Track selection needs a stream the player can read; this browser is playing the source directly.",
    };
  }

  /* `hls.audioTrack === -1` is hls.js's "follow the manifest default" state. It is
   * a real and useful option, but it is not a track — so it must not be rendered as
   * a row, and it must not be reported as the selected index, or the panel would
   * show nothing checked while a track is playing. */
  const manifestDefault = list.find((t) => t.default) || list[0];

  let selectedIndex = null;
  if (Number.isInteger(currentIndex) && currentIndex >= 0) {
    /* The engine's index is a position in ITS list, which can differ from ours
     * after dedupe. Resolve through the original index, not the deduped
     * position — matching on deduped position would select the wrong track
     * whenever anything was deduped. */
    const match = list.find((t) => t.index === currentIndex);
    selectedIndex = match ? match.index : null;
  }
  if (selectedIndex === null) selectedIndex = manifestDefault.index;

  return {
    kind: selectionKind.TRACKS,
    tracks: list,
    selectedIndex,
    /* With one rendition there is no choice, so the group must not behave like one:
     * a radiogroup of one invites arrow keys that go nowhere. Callers render
     * `kind: "single"` as a plain label instead. */
    selectable: list.length > 1,
    note: list.length > 1 ? null : "Only one selectable soundtrack in this source.",
  };
}

/**
 * Sheet options for `SheetRadioGroup`.
 *
 * Only built when the audio actually offers a choice. `selectable: false` is the
 * signal to render a read-only note instead — which is why this returns null rather
 * than a one-row group.
 *
 * @returns {{label: string, options: object[], selectedIndex: number}|null}
 */
export function audioOptions(audio) {
  if (!audio || audio.kind !== selectionKind.TRACKS || !audio.selectable) return null;

  const options = audio.tracks.map((track) => {
    /* The sub line carries what the label cannot: the code the manifest gave us,
     * and any characteristics. Without it two same-named tracks look identical. */
    const bits = [];
    if (track.lang && track.lang.toLowerCase() !== track.label.toLowerCase()) {
      bits.push(track.lang.toUpperCase());
    }
    bits.push(...track.characteristics);
    return {
      key: track.id,
      title: track.label,
      sub: bits.length ? bits.join(" · ") : undefined,
      selected: track.index === audio.selectedIndex,
      disabled: false,
      /* Carried so the caller can write the engine property without a lookup. */
      index: track.index,
    };
  });

  return {
    label: "Audio",
    options,
    selectedIndex: audio.selectedIndex,
  };
}