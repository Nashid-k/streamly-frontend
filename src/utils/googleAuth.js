// src/utils/googleAuth.js — Google Identity Services (GIS) Web SDK client helper.
//
// The "works in incognito only" bug: the fallback path calls
// google.accounts.id.prompt() (One Tap), which Google SUPPRESSES per browser
// profile after a few dismissals (exponential cooldown), when third-party
// cookies are blocked, or on opt-out. A fresh incognito profile has none of that
// state. Mitigations here:
//   1. initialize() runs exactly ONCE per page load with a swappable credential
//      handler — repeated calls are documented to cause "unexpected behavior"
//      and were logged on every modal open before.
//   2. Valid initialize options only (ux_mode was never valid for id.initialize)
//      plus explicit FedCM/ITP support flags.
//   3. A suppressed prompt() surfaces its machine-readable reason as an
//      actionable toast instead of a generic error.
// renderButton is NOT subject to the cooldown, so it stays the primary path.
import { logDebug, logWarn } from "./debugLogger";

// No hardcoded fallback (matches api/auth.js): a client id baked into the repo can
// never be rotated. Set VITE_GOOGLE_CLIENT_ID — without it the button reports
// "unavailable".
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

if (!GOOGLE_CLIENT_ID && typeof window !== "undefined") {
  logWarn(
    "auth",
    "VITE_GOOGLE_CLIENT_ID is not set — Google Sign-In is unavailable. " +
      "Set it in .env/Vercel (see .env.example) and redeploy.",
  );
}

let gsiScriptPromise = null;
let initializedGoogleId = null;
let initPromise = null;

// The credential handler is swapped by whoever drives sign-in right now (the
// rendered button or a prompt click) BEFORE they act, so the single initialize()
// callback always routes to the current owner.
let activeCredentialHandler = null;
let activeErrorHandler = null;

function routeCredential(credential) {
  if (credential) {
    activeCredentialHandler?.(credential);
  } else {
    activeErrorHandler?.(new Error("No credential returned by Google."));
  }
}

/** Load the GIS client script. A failed load resets the cached promise so the next
 *  click retries (a blocked/offline load used to poison it until reload). */
function loadGoogleGsiScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR environment"));
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);

  if (!gsiScriptPromise) {
    gsiScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(
        'script[src="https://accounts.google.com/gsi/client"]',
      );
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.google?.accounts?.id));
        existingScript.addEventListener("error", () => {
          gsiScriptPromise = null; // allow a retry on the next click
          reject(new Error("Failed to load Google Identity Services."));
        });
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
      script.onerror = () => {
        logWarn("auth", "Failed to load Google Identity Services SDK (blocked or network offline).");
        gsiScriptPromise = null; // allow a retry on the next click
        reject(new Error("Failed to load Google Identity Services."));
      };
      document.head.appendChild(script);
    });
  }

  return gsiScriptPromise;
}

/** Initialize GIS exactly once per page load; later calls reuse the session. Only
 *  valid id.initialize options are passed (the old `ux_mode` key belonged to the
 *  oauth2 clients and was silently ignored here). */
async function initGoogleAuth({ onCredential, onError } = {}) {
  if (onCredential) activeCredentialHandler = onCredential;
  if (onError) activeErrorHandler = onError;

  const googleId = await loadGoogleGsiScript();
  if (!googleId) throw new Error("Google Identity SDK unavailable");
  if (!GOOGLE_CLIENT_ID) throw new Error("Google client ID is not configured.");

  if (initializedGoogleId) return initializedGoogleId;
  if (!initPromise) {
    initPromise = Promise.resolve()
      .then(() => {
        googleId.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: routeCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
          // Route prompts through FedCM where available: browser-mediated UI
          // is not subject to the same third-party-cookie suppressions and
          // keeps working as Chrome tightens cookie policy.
          use_fedcm_for_prompt: true,
          // Keeps One Tap working on Safari / ITP browsers.
          itp_support: true,
        });
        initializedGoogleId = googleId;
        return googleId;
      })
      .catch((err) => {
        initPromise = null; // allow re-init after a failure
        throw err;
      });
  }
  return initPromise;
}

/** Render the official Google Sign-In button into a container. It always opens the
 *  account-chooser popup on click (not subject to the One Tap cooldown). */
export async function renderGoogleButton(
  containerElement,
  { onCredential, onError, theme = "filled_black", text = "signin_with", shape = "pill", width = 280 } = {},
) {
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

// Human-readable guidance for every documented One Tap suppression reason.
// https://developers.google.com/identity/gsi/web/reference/js-reference#google.accounts.id.prompt
const SUPPRESSION_HINTS = {
  opt_out_or_no_session:
    "You are signed out of Google, or sign-in prompts are disabled in your browser settings.",
  suppressed_by_user:
    "Google paused sign-in prompts for this site because one was dismissed earlier. Try again later or click the official Google button.",
  cooldown:
    "Google is cooling down sign-in prompts after repeated dismissals. Wait a while, then try the official Google button.",
  brand_not_recognized:
    "Google does not recognize this site's audience yet. Try the official Google button instead.",
  third_party_cookies_blocked:
    "Cookies for accounts.google.com are blocked, so the popup cannot open. Allow Google cookies or use the official Google button.",
  another_prompt_open:
    "Another Google sign-in popup is already open. Finish or close it first.",
  secure_context_required: "Google sign-in requires a secure (HTTPS) connection.",
  browser_not_supported: "This browser does not support Google sign-in prompts.",
  uninitialized_helper: "Google sign-in was not ready yet. Try again.",
  malformed_fedcm_config: "This site's Google sign-in configuration is invalid. Contact the site owner.",
  wrong_origin: "This site's origin is not registered with Google sign-in.",
};

function describeSuppression(reason) {
  return (
    SUPPRESSION_HINTS[reason] ||
    "Google did not display the sign-in popup. Try the official Google button instead."
  );
}

/** Prompt the One Tap / Sign-In dialog programmatically (the fallback when the
 *  official button could not render). Suppressed prompts report an actionable
 *  reason, never a silent no-op. */
export async function promptGoogleSignIn({ onCredential, onError } = {}) {
  try {
    const googleId = await initGoogleAuth({ onCredential, onError });
    if (typeof googleId.prompt !== "function") {
      const err = new Error("Google Identity SDK is missing the prompt API.");
      logWarn("auth", err.message);
      onError?.(err);
      return;
    }

    logDebug("auth", "Opening Google One Tap sign-in prompt.");
    googleId.prompt((notification) => {
      if (!notification) return;
      if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
        const reason = notification.getNotDisplayedReason?.() || "unknown";
        logWarn("auth", "Google One Tap was skipped or not displayed.", { reason });
        // Surface *why* no popup appeared, with guidance the user can act on.
        onError?.(new Error(describeSuppression(reason)));
      } else {
        logDebug("auth", "Google One Tap popup is showing.");
      }
    });
  } catch (err) {
    logWarn("auth", "Google sign-in prompt could not be opened.", { message: err?.message });
    onError?.(err);
  }
}
