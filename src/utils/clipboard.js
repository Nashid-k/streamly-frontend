import { logDebug, logError } from "./debugLogger";

/* Copy text to the clipboard without lying about the outcome.

   Order matters: the async Clipboard API is the only path that works without a
   user-gesture-dependent legacy fallback, but it is unavailable in insecure
   contexts (any http:// deploy) and can be permission-blocked. The textarea +
   execCommand path still covers those, and is also what jsdom-era tests can
   stub. Both failures are LOGGED — a copy button that silently does nothing is
   the failure mode this exists to prevent.

   Returns true only when a path reported success, so callers can tell the
   viewer the truth instead of toasting "Copied!" into an error. */
export async function copyTextToClipboard(text, label = "clipboard") {
  if (typeof text !== "string" || text.length === 0) {
    logError("clipboard", `Copy called with empty text (${label}).`, new Error("empty"), { label });
    return false;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      logDebug("clipboard", `Copied via Clipboard API (${label}).`, { label, length: text.length });
      return true;
    } catch (error) {
      // Not fatal — fall through to the legacy path.
      logDebug("clipboard", `Clipboard API rejected (${label}) — falling back.`, {
        label,
        message: error?.message,
      });
    }
  }

  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    logError("clipboard", `No clipboard path available (${label}).`, new Error("unsupported"), { label });
    return false;
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) {
      logDebug("clipboard", `Copied via legacy execCommand (${label}).`, { label, length: text.length });
      return true;
    }
    logError("clipboard", `Legacy copy reported failure (${label}).`, new Error("execCommand-false"), { label });
    return false;
  } catch (error) {
    logError("clipboard", `Legacy copy threw (${label}).`, error, { label });
    return false;
  }
}

export default copyTextToClipboard;
