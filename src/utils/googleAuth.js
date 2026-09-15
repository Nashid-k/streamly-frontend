// src/utils/googleAuth.js — Google Identity Services (GIS) Web SDK client helper
import { logDebug, logWarn } from "./debugLogger";

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "526877931132-kfsptmlhkieshdsej0rii0kpn5lc5q13.apps.googleusercontent.com";

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
  try {
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
    });
    return googleId;
  } catch (err) {
    onError?.(err);
    return null;
  }
}

/**
 * Renders the official Google Sign-In button into a DOM container element.
 */
export async function renderGoogleButton(containerElement, { onCredential, onError, theme = "filled_black", text = "signin_with", shape = "pill", width = 280 } = {}) {
  if (!containerElement) return;
  try {
    const googleId = await initGoogleAuth({ onCredential, onError });
    if (!googleId) return;

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
  }
}

/**
 * Prompts the Google One Tap / Sign-In dialog programmatically.
 */
export async function promptGoogleSignIn({ onCredential, onError } = {}) {
  try {
    const googleId = await initGoogleAuth({ onCredential, onError });
    if (googleId) {
      googleId.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          logDebug("auth", "Google One Tap was skipped or not displayed.", { reason: notification.getNotDisplayedReason?.() });
        }
      });
    }
  } catch (err) {
    onError?.(err);
  }
}
