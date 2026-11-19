/* The cold-open wait, made legible.

   The player already knows more than "Loading…": the resolve names the server,
   the probe proves media bytes, and the loader counts the fragment as it
   arrives. This module turns those events into one small state object and one
   message. It is pure on purpose — the player owns the timing and the
   throttling, so a reducer test can cover every transition without a video
   element or a React render. */

export const LOAD_PHASE = Object.freeze({
  CONNECTING: "connecting",
  PROBING: "probing",
  FIRST_BYTE: "first-byte",
  BUFFERED: "buffered",
});

/**
 * Apply one loader event. Returns the SAME object when nothing visible changed,
 * so the caller can skip a React update.
 *
 * Events:
 *   { type: "connect", server }        resolve / manifest connection
 *   { type: "probe", server }          the real media-byte probe
 *   { type: "bytes", loaded, total }   first and subsequent fragment bytes
 *   { type: "clear" }                  a frame is on screen (or the run ended)
 */
export function reduceLoadingStage(current, event) {
  if (!event || typeof event !== "object") return current;

  switch (event.type) {
    case "clear":
      return null;
    case "connect":
      return samePhase(current, LOAD_PHASE.CONNECTING, event.server)
        ? current
        : { phase: LOAD_PHASE.CONNECTING, server: cleanServer(event.server) };
    case "probe":
      return samePhase(current, LOAD_PHASE.PROBING, event.server)
        ? current
        : { phase: LOAD_PHASE.PROBING, server: cleanServer(event.server) };
    case "bytes": {
      const loaded = wholeBytes(event.loaded);
      if (loaded <= 0) return current;
      const server = cleanServer(event.server) || current?.server || null;
      const total = wholeBytes(event.total);
      // First bytes get their own beat ("Starting stream…"); the next update
      // becomes the byte-count state. A reconnect starts over at FIRST_BYTE.
      const phase =
        current?.phase === LOAD_PHASE.FIRST_BYTE || current?.phase === LOAD_PHASE.BUFFERED
          ? LOAD_PHASE.BUFFERED
          : LOAD_PHASE.FIRST_BYTE;
      if (
        current?.phase === phase &&
        current.loaded === loaded &&
        current.total === total &&
        current.server === server
      ) {
        return current;
      }
      return { phase, server, loaded, total: total >= loaded ? total : 0 };
    }
    default:
      return current;
  }
}

/** Human wording for the branded stage, or null when there is no stage. */
export function loadingStageMessage(stage) {
  if (!stage || typeof stage !== "object") return null;
  const server = cleanServer(stage.server);
  switch (stage.phase) {
    case LOAD_PHASE.CONNECTING:
      return server ? `Connecting to ${server}…` : "Connecting…";
    case LOAD_PHASE.PROBING:
      return server ? `Checking ${server}…` : "Checking the source…";
    case LOAD_PHASE.FIRST_BYTE:
      return "Starting stream…";
    case LOAD_PHASE.BUFFERED: {
      const loaded = formatBytes(stage.loaded);
      return stage.total > 0 && stage.total > stage.loaded
        ? `Buffering ${loaded} of ${formatBytes(stage.total)}…`
        : `Buffering ${loaded}…`;
    }
    default:
      return null;
  }
}

/** Compact byte count for the stage note. Keeps a zero honest instead of "0 KB". */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function samePhase(current, phase, server) {
  return current?.phase === phase && current.server === cleanServer(server);
}

function cleanServer(server) {
  return typeof server === "string" && server.trim() ? server.trim() : null;
}

function wholeBytes(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
