import { describe, expect, it } from "vitest";
import {
  estimateBytes,
  formatBytes,
  isHdrCodecs,
  parseMasterPlaylist,
  parseMediaPlaylist,
  resolutionLabel,
  safeFileName,
  variantLabel,
} from "../utils/downloadQuality";

const MASTER = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=16000000,RESOLUTION=3840x2160,FRAME-RATE=59.94,CODECS="dvhe.08.06,mp4a.40.2"
https://cdn.example.com/2160/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=23.976,CODECS="avc1.640028,mp4a.40.2"
1080/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.4d401f"
https://cdn.example.com/720/index.m3u8`;

const MASTER_URL = "https://cdn.example.com/master.m3u8";

describe("parseMasterPlaylist", () => {
  it("extracts every rendition with resolution, framerate and codecs", () => {
    const variants = parseMasterPlaylist(MASTER, MASTER_URL);
    expect(variants).toHaveLength(3);
    expect(variants[0]).toMatchObject({ height: 2160, width: 3840, bandwidth: 16000000 });
    expect(variants[1]).toMatchObject({ height: 1080, framerate: 23.976 });
    expect(variants[2].uri).toBe("https://cdn.example.com/720/index.m3u8");
  });

  it("resolves relative variant URIs against the master URL", () => {
    const variants = parseMasterPlaylist(MASTER, MASTER_URL);
    expect(variants[1].uri).toBe("https://cdn.example.com/1080/index.m3u8");
  });

  it("flags Dolby Vision/HDR10 renditions but not 8-bit AVC", () => {
    const variants = parseMasterPlaylist(MASTER, MASTER_URL);
    expect(variants[0].hdr).toBe(true);
    expect(variants[1].hdr).toBe(false);
  });

  it("treats a media playlist (no STREAM-INF) as a single rendition", () => {
    const variants = parseMasterPlaylist("#EXTM3U\n#EXTINF:6,\nseg.ts", MASTER_URL);
    expect(variants).toHaveLength(1);
    expect(variants[0].uri).toBe(MASTER_URL);
  });
});

describe("parseMediaPlaylist", () => {
  it("reads an fMP4 playlist with its init segment", () => {
    const text = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.0,
seg1.m4s
#EXTINF:6.0,
seg2.m4s`;
    const parsed = parseMediaPlaylist(text, "https://cdn.example.com/2160/index.m3u8");
    expect(parsed.kind).toBe("fmp4");
    expect(parsed.initUrl).toBe("https://cdn.example.com/2160/init.mp4");
    expect(parsed.segments.map((s) => s.url)).toEqual([
      "https://cdn.example.com/2160/seg1.m4s",
      "https://cdn.example.com/2160/seg2.m4s",
    ]);
    expect(parsed.duration).toBe(12);
    expect(parsed.count).toBe(2);
  });

  it("reads a plain MPEG-TS playlist without an init segment", () => {
    const parsed = parseMediaPlaylist("#EXTM3U\n#EXTINF:10.0,\nseg0.ts", "https://cdn.example.com/x/index.m3u8");
    expect(parsed.kind).toBe("ts");
    expect(parsed.initUrl).toBeNull();
    expect(parsed.segments[0].url).toBe("https://cdn.example.com/x/seg0.ts");
  });
});

describe("quality labels", () => {
  it("maps pixel height to a human label", () => {
    expect(resolutionLabel(3840, 2160)).toBe("4K");
    expect(resolutionLabel(2560, 1440)).toBe("2K");
    expect(resolutionLabel(1920, 1080)).toBe("1080p");
    expect(resolutionLabel(1280, 720)).toBe("720p");
    expect(resolutionLabel(854, 480)).toBe("SD");
  });

  it("appends HDR and high-framerate tags", () => {
    expect(variantLabel({ height: 2160, hdr: true, framerate: 59.94 })).toBe("4K HDR · 59.94fps");
    expect(variantLabel({ height: 1080, hdr: false, framerate: 24 })).toBe("1080p");
  });

  it("identifies HDR-capable codec strings", () => {
    expect(isHdrCodecs("dvhe.08.06")).toBe(true);
    expect(isHdrCodecs("hev1.1.6.L93.B0")).toBe(true);
    expect(isHdrCodecs("avc1.640028")).toBe(false);
  });
});

describe("size helpers", () => {
  it("estimates bytes from bandwidth and duration", () => {
    expect(estimateBytes(8000000, 60)).toBe(60000000);
    expect(estimateBytes(0, 60)).toBe(0);
  });

  it("formats byte counts and sanitises file names", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(safeFileName('Fight/Club: 1999? "cut"')).toBe("Fight Club 1999 cut");
  });
});
