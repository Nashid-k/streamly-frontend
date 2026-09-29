/* Real skip-intro / skip-credits boundaries read from an HLS manifest.
   ── Why this exists ────────────────────────────────────────────────────────
   `skipMarkers.js` guesses: a 90s intro and a 150s credits tail. Those are
   estimates, and a wrong guess either eats a scene or never fires. A manifest
   that carries cue tags states the boundary outright:

     #EXT-X-CUE-OUT:DURATION=30     → the break starts here
     #EXT-X-CUE-IN                  → the break ends here

   Cue tags are attached to the segment that FOLLOWS them, so boundaries resolve
   against the cumulative `#EXTINF` durations walked so far.

   ── What is NOT assumed ────────────────────────────────────────────────────
   That any provider emits these. Nothing in the repo read them before this file
   and no provider payload is known to carry them, so the reader is deliberately
   conservative: a window is returned only when the tag sequence is unambiguous,
   and `null` means "keep using the existing estimate", never "there is no
   intro". */

const INTRO_OUT_MAX_SECONDS = 150; // a break opening later than this isn't an intro
const CREDITS_TAIL_SECONDS = 15 * 60; // a break opening inside this tail is credits

const isFiniteNum = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * Duration declared by a CUE-OUT tag, in either dialect:
 *   #EXT-X-CUE-OUT:DURATION=30
 *   #EXT-X-CUE-OUT:30
 *   #EXT-X-CUE-OUT:DURATION=30.5,CTIME="..."   (attributes we ignore)
 * @returns {number|null}
 */
export function parseCueOutDuration(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const attr = /(?:^|,)DURATION=([0-9.]+)/i.exec(raw);
  if (attr) {
    const n = Number(attr[1]);
    return isFiniteNum(n) ? n : null;
  }
  const bare = /^([0-9.]+)/.exec(raw);
  if (bare) {
    const n = Number(bare[1]);
    return isFiniteNum(n) ? n : null;
  }
  return null;
}

/**
 * Walk a MEDIA playlist once, collecting cue windows and the total duration.
 * @returns {{windows: Array<{outAt: number, inAt: number|null, declaredDuration: number|null}>, total: number}}
 */
export function parseCueWindows(text) {
  if (!text || typeof text !== "string" || !text.includes("#EXTM3U")) {
    return { windows: [], total: 0 };
  }
  const windows = [];
  let t = 0;
  let open = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-CUE-OUT")) {
      // The tag applies to the segment that follows, so the break begins at the
      // offset accumulated so far.
      const duration = parseCueOutDuration(line.slice("#EXT-X-CUE-OUT".length).replace(/^:/, ""));
      open = { outAt: t, inAt: null, declaredDuration: isFiniteNum(duration) ? duration : null };
      windows.push(open);
      continue;
    }
    if (line.startsWith("#EXT-X-CUE-IN")) {
      if (open) open.inAt = t;
      open = null;
      continue;
    }
    if (line.startsWith("#EXTINF:")) {
      const m = /#EXTINF:([0-9.]+)/i.exec(line);
      if (m) t += Number(m[1]);
    }
  }
  return { windows, total: t };
}

/**
 * Cue-derived boundaries for one playback, or null when the manifest states
 * nothing usable (caller keeps its estimate).
 * @returns {{introEndSeconds: number, creditsStartSeconds: number|null}|null}
 */
export function getCueBoundaries(text) {
  const { windows, total } = parseCueWindows(text);
  if (!windows.length || total <= 0) return null;

  // Intro: the first break that opens early enough to be a title sequence AND
  // actually closes. An unclosed early break is a mid-roll marker, not an intro.
  let introEndSeconds = 0;
  let introWindow = null;
  for (const w of windows) {
    if (w.outAt > INTRO_OUT_MAX_SECONDS) break;
    if (isFiniteNum(w.inAt) && w.inAt > w.outAt) {
      introEndSeconds = w.inAt;
      introWindow = w;
      break;
    }
  }

  // Credits live in the tail, and the tail must scale with the asset. A fixed
  // 15-minute window is WIDER than a short asset, which would make tailFrom 0 and
  // therefore classify the intro itself as the credits. Cap the tail at a quarter
  // of the runtime, and never reuse the window already spent on the intro.
  const tailLength = Math.min(CREDITS_TAIL_SECONDS, total * 0.25);
  const tailFrom = Math.max(0, total - tailLength);
  let creditsStartSeconds = null;
  for (const w of windows) {
    if (w === introWindow) continue;
    if (w.outAt < tailFrom) continue;
    if (w.inAt === null) creditsStartSeconds = w.outAt;
    else if (creditsStartSeconds === null || w.outAt > creditsStartSeconds) creditsStartSeconds = w.outAt;
  }

  if (!introEndSeconds && creditsStartSeconds === null) return null;
  return { introEndSeconds, creditsStartSeconds };
}
