export class SubtitleEngine {
  constructor(cues = []) {
    this.cues = cues.sort((a, b) => a.start - b.start);
    this.activeCue = null;
  }

  setCues(cues) {
    this.cues = cues.sort((a, b) => a.start - b.start);
    this.activeCue = null;
  }

  getActiveCue(timeInSeconds) {
    if (this.cues.length === 0) return null;

    // Fast path: check if still in the same active cue
    if (
      this.activeCue &&
      timeInSeconds >= this.activeCue.start &&
      timeInSeconds <= this.activeCue.end
    ) {
      return this.activeCue;
    }

    // Binary search for the cue
    let low = 0;
    let high = this.cues.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const cue = this.cues[mid];

      if (timeInSeconds >= cue.start && timeInSeconds <= cue.end) {
        this.activeCue = cue;
        return cue;
      } else if (timeInSeconds < cue.start) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    this.activeCue = null;
    return null;
  }

  static parseSRT(text) {
    const cues = [];
    const blocks = text.trim().split(/\r?\n\r?\n/);

    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      if (lines.length >= 3) {
        const timeLine = lines[1];
        const match = timeLine.match(
          /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/,
        );

        if (match) {
          const start =
            parseInt(match[1]) * 3600 +
            parseInt(match[2]) * 60 +
            parseInt(match[3]) +
            parseInt(match[4]) / 1000;
          const end =
            parseInt(match[5]) * 3600 +
            parseInt(match[6]) * 60 +
            parseInt(match[7]) +
            parseInt(match[8]) / 1000;
          const text = lines
            .slice(2)
            .join("\n")
            .replace(/<[^>]+>/g, ""); // strip basic HTML formatting
          cues.push({ start, end, text });
        }
      }
    }
    return cues;
  }

  static parseVTT(text) {
    const cues = [];
    const lines = text.trim().split(/\r?\n/);
    let i = 0;

    // Skip WEBVTT header
    while (i < lines.length && !lines[i].includes("-->")) {
      i++;
    }

    while (i < lines.length) {
      if (lines[i].includes("-->")) {
        const timeLine = lines[i];
        const match = timeLine.match(
          /(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})/,
        );

        if (match) {
          const startH = match[1] ? parseInt(match[1]) : 0;
          const start =
            startH * 3600 +
            parseInt(match[2]) * 60 +
            parseInt(match[3]) +
            parseInt(match[4]) / 1000;

          const endH = match[5] ? parseInt(match[5]) : 0;
          const end =
            endH * 3600 +
            parseInt(match[6]) * 60 +
            parseInt(match[7]) +
            parseInt(match[8]) / 1000;

          i++;
          const textLines = [];
          while (i < lines.length && lines[i].trim() !== "") {
            textLines.push(lines[i].replace(/<[^>]+>/g, ""));
            i++;
          }
          cues.push({ start, end, text: textLines.join("\n") });
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
    return cues;
  }
}
