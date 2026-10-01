import { describe, expect, it } from "vitest";
import {
  hoverAnchor,
  hoverRatio,
  hoverSeconds,
  previewTarget,
  shouldShowPreview,
  THUMBNAIL_SETTLE_MS,
} from "../components/player/v2/hoverPreview";

/* PLAYER V2 hover preview (task.md 3.15, and 3.17's shared geometry).
 *
 * 3.15 asks for two things and only one of them is new: hover shows a timecode
 * bubble, and the thumbnail becomes opt-in behind `T`. The legacy has both already
 * (`NativePlayerView.jsx:4279` and `:4249`), so the honest reading is that 3.15 is
 * about the THUMBNAIL being opt-in, and 3.17 is the geometry.
 *
 * This file exists mostly to pin down the edges of the clamp, because the edges are
 * where the two legacy geometry sources disagree and where a viewer can see the
 * player lying:
 *
 *   bubble     `left: min(94, max(6, ratio * 100))%`      — clamped in PERCENT
 *   thumbnail  `left: min(max(ratio * playerW, thumbInset),
 *                          max(thumbInset, playerW - thumbInset))` px
 *                                                          — measured in PIXELS
 *                                                          — against the PLAYER
 *
 * Three separate faults, all invisible on a title you test on a desktop monitor:
 *
 *   1. 6% of a 360px phone is 21.6px. A timecode bubble is wider than that, so the
 *      clamp puts half of it off the left edge of a phone. A percentage clamp
 *      cannot fix this because it never learns the bubble's width.
 *   2. The bubble clamps against the TRACK and the thumbnail against the PLAYER.
 *      The track is inset by the timecodes, so at the same hover ratio the two sit
 *      at different x positions — and 3.17 is the item that admits this.
 *   3. `hoverRatio * playerW` uses the player width to place something that is
 *      measured from the track's left edge. On any layout where the track does not
 *      start at the player's left edge, the card is offset by exactly that inset,
 *      which is the difference between "the preview is over the position you are
 *      pointing at" and "the preview is over somewhere to the right of it".
 *
 * `hoverAnchor` is the one geometry source both previews read, which is 3.17 done
 * rather than deferred.
 */

const TRACK = { left: 0, width: 320 };

describe("hoverRatio reads the TRACK, not the window", () => {
  it("is 0 at the left edge and 1 at the right", () => {
    expect(hoverRatio(0, TRACK)).toBe(0);
    expect(hoverRatio(160, TRACK)).toBe(0.5);
    expect(hoverRatio(320, TRACK)).toBe(1);
  });

  it("accounts for where the track actually is", () => {
    // The fault behind legacy fault 3. A track inset by 48px of timecode: pointing
    // at its own midpoint must be 0.5, not 0.65. Dividing by the window width here
    // is what makes a preview card sit to the right of the position being aimed at.
    const inset = { left: 48, width: 320 };
    expect(hoverRatio(48 + 160, inset)).toBe(0.5);
    expect(hoverRatio(48, inset)).toBe(0);
    expect(hoverRatio(368, inset)).toBe(1);
  });

  it("clamps a pointer outside the track instead of going negative or past 1", () => {
    // A drag continues past the ends of the track — that is how a viewer seeks to
    // the start or the end. An unclamped ratio becomes a negative timecode or one
    // beyond the duration.
    expect(hoverRatio(-40, TRACK)).toBe(0);
    expect(hoverRatio(400, TRACK)).toBe(1);
  });

  it("reports 0 for a track that has not been laid out", () => {
    // jsdom reports 0x0 for every rect, so an unguarded division is Infinity on
    // the first render — which is `NaN` timecodes on the frame the viewer arrives.
    expect(hoverRatio(100, null)).toBe(0);
    expect(hoverRatio(100, { left: 0, width: 0 })).toBe(0);
    expect(hoverRatio(100, { left: 0, width: -5 })).toBe(0);
    expect(hoverRatio(NaN, TRACK)).toBe(0);
  });
});

describe("hoverSeconds is the ratio against THIS control's duration", () => {
  it("scales the ratio", () => {
    expect(hoverSeconds(0.5, 200)).toBe(100);
    expect(hoverSeconds(0, 200)).toBe(0);
    expect(hoverSeconds(1, 200)).toBe(200);
  });

  it("clamps to the duration rather than trusting the ratio", () => {
    expect(hoverSeconds(1.4, 200)).toBe(200);
    expect(hoverSeconds(-0.2, 200)).toBe(0);
  });

  it("reports 0 for an unknown duration", () => {
    // This is why `shouldShowPreview` requires a known duration: `0:00` under the
    // pointer claims "the start of the film" when the truth is "we do not know".
    expect(hoverSeconds(0.5, 0)).toBe(0);
    expect(hoverSeconds(0.5, NaN)).toBe(0);
  });
});

describe("hoverAnchor is the one clamp both previews read (3.17)", () => {
  it("leaves a centred position alone", () => {
    const a = hoverAnchor(0.5, 80, 320);
    expect(a.left).toBe(50);
    expect(a.clamped).toBe(false);
  });

  it("keeps the whole card on screen at BOTH ends", () => {
    // The actual requirement, and the one the legacy's 6%/94% cannot satisfy: a
    // card centred on ratio 0 has its left half off-screen.
    const width = 80;
    const track = 320;
    const pad = (width / 2 / track) * 100;
    const left = hoverAnchor(0, width, track);
    const right = hoverAnchor(1, width, track);
    // Half the card (40px) is still on screen...
    expect(left.left).toBeCloseTo(pad, 6);
    expect(left.clamped).toBe(true);
    expect(right.left).toBeCloseTo(100 - pad, 6);
    expect(right.clamped).toBe(true);
    // ...which is the assertion the percentage clamp fails: 0% of 320 is 0, so the
    // card CENTRES on the screen edge and half of it is beyond it. `left` is the
    // card's CENTRE (the caller pairs it with `translateX(-50%)`), so the edges
    // are centre ± half the card.
    const leftEdge = (left.left * track) / 100;
    const rightEdge = (right.left * track) / 100;
    expect(leftEdge - width / 2).toBeGreaterThanOrEqual(0);
    expect(rightEdge + width / 2).toBeLessThanOrEqual(track);
  });

  it("never regresses into a percentage-only clamp", () => {
    // On a wide track a 6%-style clamp and a measured clamp agree, so the defect
    // hides on desktop. These are the phone numbers.
    const track = 360;
    const width = 96;
    const pad = (width / 2 / track) * 100;
    expect(hoverAnchor(0, width, track).left).toBeCloseTo(pad, 6);
    expect(hoverAnchor(0, width, track).left).toBeGreaterThan(6);
    expect(hoverAnchor(1, width, track).left).toBeCloseTo(100 - pad, 6);
    expect(hoverAnchor(1, width, track).left).toBeLessThan(94);
  });

  it("scales with the track, because the answer is a fraction OF the track", () => {
    // A pixel offset cannot do this. A 50%-hover card on a 320px track and on a
    // 1200px track must be the same DISTANCE from the pointer, and a fixed `left`
    // in pixels would drift by 440px on the second.
    const small = hoverAnchor(0.5, 80, 320);
    const large = hoverAnchor(0.5, 80, 1200);
    expect(small.left).toBe(large.left);
    expect(small.shift).toBe(large.shift);
  });

  it("centres rather than clamping when the card is wider than the track", () => {
    // There is no in-bounds position, so pinning to an edge would make the card
    // jump between edges as the pointer crosses a tiny track. Overflowing from the
    // centre is the stable choice.
    const a = hoverAnchor(0, 400, 320);
    expect(a.left).toBe(0);
    expect(a.clamped).toBe(false);
    expect(a.shift).toBe(0);
  });

  it("does not produce NaN for an unmeasured card", () => {
    // The bubble's width is only known after layout. A NaN offset is a card that
    // disappears, and it disappears on the first frame — the worst moment.
    for (const width of [0, -10, NaN, undefined, null]) {
      const a = hoverAnchor(0.5, width, 320);
      expect(Number.isFinite(a.left)).toBe(true);
      expect(Number.isFinite(a.shift)).toBe(true);
    }
  });

  it("clamps a ratio that arrives out of range", () => {
    expect(hoverAnchor(1.9, 80, 320).left).toBe(87.5);
    expect(hoverAnchor(-0.5, 80, 320).left).toBe(12.5);
  });

  it("reads an unusable ratio as the start, agreeing with hoverSeconds", () => {
    // The two have to fall the same way. `hoverSeconds` maps an unknown position to
    // 0, so a bubble reading `0:00` must be CENTRED at the start of the bar; if the
    // geometry put it in the middle instead, a `0:00` would appear to float over the
    // middle of a title that is playing.
    const a = hoverAnchor(NaN, 80, 320);
    expect(a.left).toBe(hoverAnchor(0, 80, 320).left);
    expect(hoverAnchor(undefined, 80, 320).left).toBe(hoverAnchor(0, 80, 320).left);
  });

  it("reports when it clamped, so the caller can tell a clamped card from a centred one", () => {
    // Without this the caller cannot tell "the card is at the edge because the
    // pointer is there" from "the card is at the edge because we moved it", and a
    // future arrow/offset would be added blind.
    expect(hoverAnchor(0.5, 80, 320).clamped).toBe(false);
    expect(hoverAnchor(0, 80, 320).clamped).toBe(true);
    expect(hoverAnchor(0, 400, 320).clamped).toBe(false);
  });

  it("uses zero shift, so the card is positioned by `left` alone", () => {
    // If `shift` ever became non-zero there would be a SECOND positioning input
    // and the card could be moved by two disagreeing numbers. It is pinned here so
    // that adding one has to be a deliberate, visible change.
    expect(hoverAnchor(0.3, 80, 320).shift).toBe(0);
  });
});

describe("shouldShowPreview refuses to show nothing", () => {
  it("needs a known duration", () => {
    // The legacy guarded `safeDuration > 0` for exactly this reason. A bubble at
    // `0:00` under the pointer is a false statement about the video.
    expect(shouldShowPreview({ live: true, duration: 0 })).toBe(false);
    expect(shouldShowPreview({ live: true, duration: NaN })).toBe(false);
    expect(shouldShowPreview({ live: true, duration: -5 })).toBe(false);
    expect(shouldShowPreview({ live: true, duration: 200 })).toBe(true);
  });

  it("needs the control to be live", () => {
    expect(shouldShowPreview({ live: false, duration: 200 })).toBe(false);
    expect(shouldShowPreview({ live: true, duration: 200 })).toBe(true);
  });

  it("refuses entirely for an inert control", () => {
    // An absent or disabled scrubber has no position to preview. Showing a bubble
    // over a control that cannot seek claims the seek is available.
    expect(shouldShowPreview({ live: true, duration: 200, inert: true })).toBe(false);
    expect(shouldShowPreview({ live: true, duration: 0, inert: true })).toBe(false);
  });

  it("does not crash when called with nothing", () => {
    expect(shouldShowPreview()).toBe(false);
    expect(shouldShowPreview({})).toBe(false);
  });
});

describe("previewTarget picks the right URL to decode from", () => {
  /* `previewThumbs.js` mounts its own hls.js and needs two different URLs: one to
   * OPEN and one to send as a referer. Getting the first wrong decodes the preview
   * at the worst available quality; getting the second wrong 403s every decode.
   *
   * `usePlayerSource` already encodes the master-vs-refUrl rule for playback
   * (`extractPlayableUrl`), and the legacy encoded it a third time for previews at
   * `NativePlayerView.jsx:3397`. These cases are the reason this copy is tested
   * rather than assumed to match. */

  it("opens a multi-level master FROM the master, so the decoder picks a rendition", () => {
    // Opening `refUrl` here gives a preview decoded at whatever single rendition the
    // resolve returned first — on a 4K title, usually the worst one available.
    const target = previewTarget({
      source: {
        key: "vidcore",
        url: "https://cdn.test/master.m3u8",
        refUrl: "https://cdn.test/720/index.m3u8",
        multiLevelMaster: true,
      },
    });
    expect(target.url).toBe("https://cdn.test/master.m3u8");
    // The referer is still the rendition URL — it is the token, not the thing to open.
    expect(target.refUrl).toBe("https://cdn.test/720/index.m3u8");
  });

  it("opens a single rendition from its refUrl", () => {
    const target = previewTarget({
      source: {
        key: "vidsrc",
        url: "https://cdn.test/1080/index.m3u8",
        refUrl: "https://cdn.test/720/index.m3u8",
        multiLevelMaster: false,
      },
    });
    expect(target.url).toBe("https://cdn.test/720/index.m3u8");
  });

  it("falls back to `url` when there is no refUrl", () => {
    const target = previewTarget({
      source: { key: "x", url: "https://cdn.test/a.m3u8", multiLevelMaster: false },
    });
    expect(target.url).toBe("https://cdn.test/a.m3u8");
    // And uses it as its own referer, because the loader always wants one.
    expect(target.refUrl).toBe("https://cdn.test/a.m3u8");
  });

  it("keys on the ladder key, not the URL", () => {
    // The pipeline caches per `sourceKey` and remounts on a change of it
    // (`previewThumbs.js:86`). Keying by URL would make every quality switch look
    // like a different film: a full remount and a full cache miss.
    const target = previewTarget({
      source: { key: "vidcore", url: "https://cdn.test/a.m3u8", refUrl: "https://cdn.test/b.m3u8" },
    });
    expect(target.sourceKey).toBe("vidcore");
  });

  it("returns null when there is nothing decodable", () => {
    // A decode attempt that cannot succeed is a failure log on every hover.
    expect(previewTarget(null)).toBeNull();
    expect(previewTarget({})).toBeNull();
    expect(previewTarget({ source: {} })).toBeNull();
    // A master that lost its url must not fall back to a refUrl it was told not to use.
    expect(previewTarget({ source: { refUrl: "https://x/r.m3u8", multiLevelMaster: true } })).toBeNull();
  });
});

describe("the thumbnail is opt-in, and settling is what makes that mean something", () => {
  it("has a settle delay, and it is not zero", () => {
    // 3.15: "the thumbnail is opt-in (`T`)". Opt-in alone is opt-in in name only —
    // the legacy's cost was a SECOND FULL HLS SESSION per source
    // (`previewThumbs.js:107-121`). A viewer who opts in and then sweeps the
    // pointer across the bar must not open a decoder for every position they pass.
    expect(THUMBNAIL_SETTLE_MS).toBeGreaterThan(0);
    expect(THUMBNAIL_SETTLE_MS).toBeGreaterThanOrEqual(100);
    // Short enough that a deliberate hover still gets art: this is a settle, not a
    // modal.
    expect(THUMBNAIL_SETTLE_MS).toBeLessThanOrEqual(400);
  });
});