import { variantLabel } from "../../utils/hlsPlaylist";

export function fmtTime(s) {
  const v = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const r = v % 60;
  // Netflix style: m:ss under an hour, h:mm:ss above (156:22 -> 2:36:22).
  return (h > 0 ? `${h}:` : "") + (h > 0 ? String(m).padStart(2, "0") : `${m}`) + `:${String(r).padStart(2, "0")}`;
}

// Canonical quality label + order: feeds list their ladders in any order, so
// the menu always reads low → high (480p → 720p → 1080p → 2K → 4K) regardless.
// Resolution + verified-only tags (HDR/SDR/60fps), no bitrate, no transport notes.
export function qualityLabelFor(v) {
  if (!v?.height) return "Auto";
  return variantLabel(v);
}

/* "HD or better" tag that agrees with the LABELS, not the raw pixel rows: a
   scope/cinema rung cut at 1920x804 labels "1080p" (width-first resolutionLabel)
   but its raw height is below 1080, so height-based checks left both the gear
   badge and the inline row tag missing on exactly the rungs the menu calls HD. */
export function qualityHdTag(v) {
  const label = String(v?.label || qualityLabelFor(v) || "");
  return /^(1080p|2K)(\s|$)/.test(label) ? "HD" : "";
}

/* One row per DISTINCT LABEL, tallest/highest-bandwidth rendition kept. Shared
   by the open path (resolver `variants`) and the post-swap ladder rebuild
   (hls.levels of a swapped source) so both menus dedupe identically. */
export function buildQualityRows(variantsList) {
  const byLabel = new Map();
  variantsList
    .slice()
    .sort((a, b) => (a.height || 0) - (b.height || 0))
    .forEach((v) => {
      const label = qualityLabelFor(v);
      const prev = byLabel.get(label);
      if (
        !prev ||
        (v.height || 0) > (prev.height || 0) ||
        ((v.height || 0) === (prev.height || 0) && (v.bandwidth || 0) > (prev.bandwidth || 0))
      ) {
        byLabel.set(label, { uri: v.uri, height: v.height || 0, label, bandwidth: v.bandwidth || 0 });
      }
    });
  return Array.from(byLabel.values());
}

export function zoneOf(rect, clientX) {
  const x = clientX - rect.left;
  if (x < rect.width / 3) return "left";
  if (x > (rect.width * 2) / 3) return "right";
  return "center";
}
