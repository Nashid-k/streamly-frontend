// src/utils/googleAuth.js — Google Identity Services (GIS) Web SDK client helper
import { logDebug, logWarn } from "./debugLogger";

// No hardcoded fallback (matches the api/auth.js hardening): a client id baked
// into the repo can never be rotated via env. Set VITE_GOOGLE_CLIENT_ID in the
// build env — without it the sign-in button reports "unavailable".
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

if (!GOOGLE_CLIENT_ID && typeof window !== "undefined") {
  logWarn(
    "auth",
    "VITE_GOOGLE_CLIENT_ID is not set — Google Sign-In is unavailable. " +
      "Set it in .env/Vercel (see .env.example) and redeploy.",
  );
}

let gsiScriptPromise = null;

/**
 * Dynamically loads the official Google Identity Services client script.
 */
export function loadGoogleGsiScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR environment"));
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);

  if (!gsiScriptPromise) {
    gsiScriptPromise = new Promise((resolve, reject) => {
      // Check if already injected
      const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.google?.accounts?.id));
        existingScript.addEventListener("error", (err) => reject(err));
        return;
      }

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        logDebug("auth", "Google Identity Services SDK loaded successfully.");
        resolve(window.google?.accounts?.id);
      };
      script.onerror = (err) => {
        logWarn("auth", "Failed to load Google Identity Services SDK (blocked or network offline).", { error: err });
        reject(new Error("Failed to load Google Identity Services."));
      };
      document.head.appendChild(script);
    });
  }

  return gsiScriptPromise;
}

/**
 * Initializes Google Identity Services with client ID and callback.
 */
export async function initGoogleAuth({ onCredential, onError }) {
  // No swallow-and-return-null here: a failed SDK load used to resolve
  // `null`, which let callers treat "GIS never loaded" as success and hide
  // the clickable fallback. Failures now propagate to the callers, each of
  // which surfaces exactly one onError.
  const googleId = await loadGoogleGsiScript();
  if (!googleId) throw new Error("Google Identity SDK unavailable");

  googleId.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (response) => {
      if (response?.credential) {
        onCredential?.(response.credential);
      } else {
        onError?.(new Error("No credential returned by Google."));
      }
    },
    auto_select: false,
    cancel_on_tap_outside: true,
    // Driven from a button click, so force the interactive One Tap popup
    // (never the redirect flow), satisfying the "click opens the popup" path.
    ux_mode: "popup",
  });
  return googleId;
}

/**
 * Renders the official Google Sign-In button into a DOM container element.
 */
export async function renderGoogleButton(containerElement, { onCredential, onError, theme = "filled_black", text = "signin_with", shape = "pill", width = 280 } = {}) {
  if (!containerElement) return;
  try {
    const googleId = await initGoogleAuth({ onCredential, onError });
    googleId.renderButton(containerElement, {
      type: "standard",
      theme,
      size: "large",
      text,
      shape,
      logo_alignment: "left",
      width: typeof width === "number" ? width : undefined,
    });
  } catch (err) {
    logWarn("auth", "Error rendering Google Sign-In button:", { message: err?.message });
    onError?.(err);
    // Rethrow so callers can flip visual state ("unavailable") instead of
    // treating a silent return as a successful render.
    throw err;
  }
}

/**
 * Prompts the Google One Tap / Sign-In dialog programmatically.
 */
export async function promptGoogleSignIn({ onCredential, onError } = {}) {
  try {
    const googleId = await initGoogleAuth({ onCredential, onError });
    if (typeof googleId.prompt !== "function") {
      const err = new Error("Google Identity SDK is missing the prompt API.");
      logWarn("auth", err.message);
      onError?.(err);
      return;
    }

    logDebug("auth", "Opening Google One Tap sign-in prompt (ux_mode=popup).");
    googleId.prompt((notification) => {
      if (!notification) return;
      if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
        const reason = notification.getNotDisplayedReason?.() || "unknown";
        logWarn("auth", "Google One Tap was skipped or not displayed.", { reason });
        // Never a silent no-op: surface *why* no popup appeared.
        onError?.(new Error(`Google One Tap did not open (${reason}). Check popup / ad-blocker settings.`));
      } else {
        logDebug("auth", "Google One Tap popup is showing.");
      }
    });
  } catch (err) {
    logWarn("auth", "Google sign-in prompt could not be opened.", { message: err?.message });
    onError?.(err);
  }
}
