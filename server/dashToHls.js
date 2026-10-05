// server/dashToHls.js — manifest-only MPD -> HLS (fMP4) transcoder.
//
// WHY THIS EXISTS: the ZXC/vidstuck family serves two of its four servers as
// MPEG-DASH manifests, not HLS. This app is HLS-only by construction — hls.js
// is the sole player and the whole relay (api/stream.js `manifest`,
// `playlist`, `segment`, plus src/api/nativeHlsLoader.js) is shaped around
// m3u8 text. Rather than add a second player (dash.js) and a second byte path,
// we rewrite the MANIFEST and touch no media bytes at all: every DASH
// `SegmentTemplate` becomes an `#EXT-X-MAP` init segment plus one HLS segment
// per timeline entry. hls.js then muxes video + audio through MSE exactly as it
// does for any other fMP4 ladder.
//
// SCOPE — deliberately narrow, because a wrong playlist is worse than no
// playlist:
//   · `SegmentTemplate` with a `SegmentTimeline` (r, including r="-1"), or with
//     a fixed `duration`. `SegmentList`, `SegmentBase`, content protection,
//     multiple Periods and `BaseURL` inheritance are NOT supported; a manifest
//     that needs them returns null and the caller answers an honest no-source
//     rather than serving a broken ladder.
//   · Every `initialization`/`media` URL is used verbatim. DASH templates here
//     are absolute and carry their own per-representation auth query, so
//     nothing is resolved against a BaseURL and no relative-URL guess is made.
//
// Pure string work — no fetch, no DOM, no node builtins — so it unit-tests in
// jsdom exactly like src/utils/downloadQuality.js does.

const MAX_TEMPLATE_SEGMENTS = 20000; // ~28h at 5s; a guard, not a real limit.

// ── tiny XML readers (no DOMParser on the server runtime) ──────────────

function decodeEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readAttrs(openTag) {
  const out = {};
  const re = /([A-Za-z][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(String(openTag || ""))) !== null) out[m[1]] = m[2];
  return out;
}

/* Slice <tag>…</tag> pairs out of a document. Self-closing tags are detected
   by inspecting the characters before ">" (not by a regex group) — the lazy
   `(/?)` trick silently mis-detects `<S t="0" d="1" />` and then hunts for a
   `</S>` that never arrives, dropping the segment. */
function sliceElements(xml, tagName) {
  const source = String(xml || "");
  const out = [];
  const open = new RegExp(`<${tagName}(?=[\\s/>])[^>]*>`, "g");
  let m;
  while ((m = open.exec(source)) !== null) {
    const start = m.index;
    const tag = m[0];
    if (tag.endsWith("/>")) {
      out.push({ start, end: open.lastIndex, open: tag, inner: "" });
      continue;
    }
    const close = `</${tagName}>`;
    const closeIdx = source.indexOf(close, open.lastIndex);
    if (closeIdx < 0) continue;
    out.push({ start, end: closeIdx + close.length, open: tag, inner: source.slice(open.lastIndex, closeIdx) });
    open.lastIndex = closeIdx + close.length;
  }
  return out;
}

function firstElement(xml, tagName) {
  return sliceElements(xml, tagName)[0] || null;
}

// ISO-8601 duration → seconds. Only what an MPD can legally carry.
function parseIsoDuration(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const m = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(text);
  if (!m) return 0;
  const n = m.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
  const [y, mo, d, h, mi, s] = n;
  if (n.some((x) => !Number.isFinite(x))) return 0;
  return y * 31536000 + mo * 2592000 + d * 86400 + h * 3600 + mi * 60 + s;
}

function parseFrameRate(value) {
  const m = /^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/.exec(String(value || "").trim());
  if (!m) return 0;
  const num = Number(m[1]);
  const den = m[2] === undefined ? 1 : Number(m[2]);
  if (!den) return 0;
  return Math.round((num / den) * 1000) / 1000;
}

// ── $-identifier substitution (DASH §5.2 templating) ───────────────────

function padNumber(value, width) {
  return String(value).padStart(width, "0");
}

/* Substitute the DASH template identifiers. `$$` is an escaped literal "$" —
   it is stashed behind a private-use sentinel so the identifier passes below
   cannot match it, then restored at the end. */
const DOLLAR_SENTINEL = "\uE000";

export function substituteTemplate(template, { representationId = "", bandwidth = 0, number = 0 } = {}) {
  let out = String(template || "").replace(/\$\$/g, DOLLAR_SENTINEL);
  out = out.replace(/\$Number%(\d+)d\$/g, (_, width) => padNumber(number, Number(width)));
  out = out.replace(/\$Number\$/g, () => String(number));
  out = out.replace(/\$RepresentationID\$/g, () => String(representationId));
  out = out.replace(/\$Bandwidth\$/g, () => String(bandwidth));
  out = out.replace(/\$SubNumber\$/g, () => "0");
  out = out.replace(/\$SubRepresentationID\$/g, () => String(representationId));
  return out.replace(new RegExp(DOLLAR_SENTINEL, "g"), "$");
}

// ── SegmentTimeline expansion ─────────────────────────────────────────

/* Returns [{ number, d }] in timescale units, starting at `startNumber`.
   `periodUnits` (period duration in the same timescale) resolves r="-1",
   which DASH defines as "repeat until the period ends". */
function expandTimeline(timelineXml, startNumber, periodUnits) {
  const segments = [];
  let number = startNumber;
  let cursor = 0; // running presentation time, in timescale units
  let explicitStart = false;

  for (const el of sliceElements(timelineXml, "S")) {
    const a = readAttrs(el.open);
    const d = Number(a.d);
    if (!Number.isFinite(d) || d <= 0) continue;
    if (a.t !== undefined) {
      const t = Number(a.t);
      if (Number.isFinite(t)) {
        cursor = t;
        explicitStart = true;
      }
    }
    let repeat = a.r === undefined ? 0 : Number(a.r);
    if (!Number.isFinite(repeat) || repeat < 0) {
      repeat = periodUnits > 0 ? Math.max(0, Math.ceil((periodUnits - cursor) / d) - 1) : 0;
    }
    for (let i = 0; i <= repeat && segments.length < MAX_TEMPLATE_SEGMENTS; i += 1) {
      segments.push({ number, d });
      cursor += d;
      number += 1;
    }
  }
  if (!segments.length && explicitStart) return segments;
  return segments;
}

// ── the MPD parser ────────────────────────────────────────────────────

/* Returns { durationSeconds, video, audio } or null when the manifest is not
   something this transcoder can represent honestly. Each representation carries
   everything buildMediaPlaylist needs — template, timescale, numbering and the
   expanded segment list — so the media playlist is a pure string build. */
export function parseMpd(xml) {
  const text = String(xml || "");
  if (!/<MPD[\s>]/i.test(text)) return null;

  const mpdOpen = /<MPD(?=[\s/>])[^>]*>/.exec(text);
  if (!mpdOpen) return null;
  const mpdAttrs = readAttrs(mpdOpen[0]);

  // Content protection means encrypted segments: a rewrite cannot make those
  // playable, so refuse rather than hand hls.js a ladder that 403s mid-play.
  if (/ContentProtection/i.test(text)) return null;

  const period = firstElement(text, "Period");
  if (!period) return null;
  const periodAttrs = readAttrs(period.open);

  const durationSeconds = parseIsoDuration(mpdAttrs.mediaPresentationDuration);
  const periodSeconds = parseIsoDuration(periodAttrs.duration) || durationSeconds;
  if (!periodSeconds) return null;

  const video = [];
  const audio = [];

  for (const set of sliceElements(period.inner, "AdaptationSet")) {
    const setAttrs = readAttrs(set.open);
    const contentType = String(setAttrs.contentType || "").toLowerCase();
    if (contentType !== "video" && contentType !== "audio") continue;

    const setTemplate = firstElement(set.inner, "SegmentTemplate");
    const setTemplateAttrs = setTemplate ? readAttrs(setTemplate.open) : {};
    const setTimeline = firstElement(set.inner, "SegmentTimeline");
    const setMime = decodeEntities(setAttrs.mimeType || "");
    const language = decodeEntities(setAttrs.lang || "");

    for (const rep of sliceElements(set.inner, "Representation")) {
      const repAttrs = readAttrs(rep.open);
      const repTemplate = firstElement(rep.inner, "SegmentTemplate") || setTemplate;
      if (!repTemplate) continue;
      const templateAttrs = readAttrs(repTemplate.open);
      const timeline = firstElement(repTemplate.inner, "SegmentTimeline") || setTimeline;

      const mediaTemplate = decodeEntities(templateAttrs.media || setTemplateAttrs.media || "");
      const initTemplate = decodeEntities(templateAttrs.initialization || setTemplateAttrs.initialization || "");
      if (!mediaTemplate) continue;

      const timescale = Number(templateAttrs.timescale || setTemplateAttrs.timescale || 1) || 1;
      const startNumber = Number(templateAttrs.startNumber || setTemplateAttrs.startNumber || 1) || 1;
      const periodUnits = Math.round(periodSeconds * timescale);

      let segments = [];
      if (timeline) {
        segments = expandTimeline(timeline.inner, startNumber, periodUnits);
      } else {
        const fixed = Number(templateAttrs.duration || setTemplateAttrs.duration || 0);
        if (fixed > 0) {
          const count = Math.min(MAX_TEMPLATE_SEGMENTS, Math.floor(periodUnits / fixed));
          for (let i = 0; i < count; i += 1) segments.push({ number: startNumber + i, d: fixed });
        }
      }
      // A representation we cannot enumerate is a representation we cannot play.
      if (segments.length === 0) continue;

      const id = String(repAttrs.id ?? setAttrs.id ?? "");
      const bandwidth = Number(repAttrs.bandwidth || setAttrs.bandwidth || 0) || 0;
      const entry = {
        id,
        codecs: decodeEntities(repAttrs.codecs || setAttrs.codecs || ""),
        mimeType: decodeEntities(repAttrs.mimeType || setMime || ""),
        bandwidth,
        width: Number(repAttrs.width || setAttrs.width || setAttrs.maxWidth || 0) || 0,
        height: Number(repAttrs.height || setAttrs.height || setAttrs.maxHeight || 0) || 0,
        frameRate: parseFrameRate(repAttrs.frameRate || setAttrs.frameRate || setAttrs.maxFrameRate),
        language,
        timescale,
        startNumber,
        initUrl: initTemplate ? substituteTemplate(initTemplate, { representationId: id, bandwidth }) : "",
        mediaTemplate,
        segments,
        durationSeconds: segments.reduce((sum, s) => sum + s.d, 0) / timescale,
      };

      if (contentType === "audio") audio.push(entry);
      else video.push(entry);
    }
  }

  if (video.length === 0 && audio.length === 0) return null;
  // Highest rung first — the player's quality menu reads them in order.
  video.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
  audio.sort((a, b) => b.bandwidth - a.bandwidth);
  return { durationSeconds, periodSeconds, video, audio };
}

// ── HLS emission ──────────────────────────────────────────────────────

// EXTINF is decimal seconds; 5 decimal places is well inside HLS tolerance and
// keeps the accumulated drift over a feature under a frame.
function formatDuration(seconds) {
  return Math.max(0.00001, Math.round(seconds * 100000) / 100000).toFixed(5);
}

function segmentUrl(rep, number) {
  return substituteTemplate(rep.mediaTemplate, {
    representationId: rep.id,
    bandwidth: rep.bandwidth,
    number,
  });
}

/* One rendition's media playlist: EXT-X-MAP for the fMP4 init segment, then
   one EXTINF + URI per DASH segment. The init segment and every media segment
   are absolute upstream URLs carrying their own auth query, so the existing
   `segment` relay can fetch them with nothing but `refUrl`. */
export function buildMediaPlaylist(rep) {
  const durations = rep.segments.map((s) => s.d / rep.timescale);
  const targetDuration = Math.max(1, Math.ceil(Math.max(...durations, 0)));
  const out = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${rep.startNumber}`,
  ];
  if (rep.initUrl) out.push(`#EXT-X-MAP:URI="${rep.initUrl}"`);
  for (let i = 0; i < rep.segments.length; i += 1) {
    out.push(`#EXTINF:${formatDuration(durations[i])},`);
    out.push(segmentUrl(rep, rep.segments[i].number));
  }
  out.push("#EXT-X-ENDLIST", "");
  return out.join("\n");
}

/* The master: one EXT-X-STREAM-INF per video representation, all sharing one
   audio group. `mediaUrlFor(representationId)` returns the addressable URL of
   that rendition's media playlist — the caller supplies a replayable URL (not
   a blob) so hls.js's playlist loads route back through the relay. */
export function buildMasterPlaylist(manifest, mediaUrlFor) {
  const { video, audio } = manifest;
  const out = ["#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-INDEPENDENT-SEGMENTS"];
  if (audio.length > 0) {
    const primary = audio[0];
    out.push(
      `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="${primary.language || "Audio"}",` +
        `LANGUAGE="${primary.language || "und"}",DEFAULT=YES,AUTOSELECT=YES,` +
        `URI="${mediaUrlFor(primary.id)}"`,
    );
  }
  const audioCodec = audio.length > 0 ? audio[0].codecs : "";
  for (const rep of video) {
    const attrs = [`BANDWIDTH=${rep.bandwidth}`];
    if (rep.width && rep.height) attrs.push(`RESOLUTION=${rep.width}x${rep.height}`);
    if (rep.frameRate) attrs.push(`FRAME-RATE=${rep.frameRate.toFixed(3)}`);
    const codecs = [rep.codecs, audioCodec].filter(Boolean).join(",");
    if (codecs) attrs.push(`CODECS="${codecs}"`);
    if (audio.length > 0) attrs.push('AUDIO="aac"');
    out.push(`#EXT-X-STREAM-INF:${attrs.join(",")}`);
    out.push(mediaUrlFor(rep.id));
  }
  // Audio-only MPD (no video representations) still needs one playable row, or
  // hls.js rejects a master with no variants.
  if (video.length === 0 && audio.length > 0) {
    out.push(`#EXT-X-STREAM-INF:BANDWIDTH=${audio[0].bandwidth},CODECS="${audio[0].codecs}"`);
    out.push(mediaUrlFor(audio[0].id));
  }
  out.push("");
  return out.join("\n");
}

/* The variant ladder the download sheet and the player's quality menu read,
   in the same shape parseMasterPlaylist produces for a native HLS master. */
export function manifestToVariants(manifest) {
  return manifest.video.map((rep) => ({
    representationId: rep.id,
    uri: "",
    bandwidth: rep.bandwidth,
    width: rep.width,
    height: rep.height,
    framerate: rep.frameRate,
    codecs: rep.codecs,
  }));
}
