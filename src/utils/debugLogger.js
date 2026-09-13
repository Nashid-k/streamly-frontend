/**
 * debugLogger — single place for browser console diagnostics.
 *
 * Why this exists: several data paths (TMDB fetches, React Query rails,
 * localStorage lists, stream servers, thumbnails/subtitles) used to fail
 * silently — an empty rail or a "Title not found" screen gave no hint about
 * *why* data didn't load. These helpers standardise the log shape so any
 * failure can be traced from the console:
 *
 *   [Streamly][<scope>] <message> + optional structured context object
 *
 * - `logError`   → console.error (real failures: network, HTTP, exceptions)
 * - `logWarn`    → console.warn  (degraded / empty-data states)
 * - `logInfo`    → console.info  (useful lifecycle checkpoints, dev + prod)
 * - `logDebug`   → console.debug (verbose, dev only unless ?debug=1)
 *
 * All helpers are safe to call with undefined errors/context and never throw.
 */

const PREFIX = "[Streamly]";

function isBrowser() {
  return typeof window !== "undefined";
}

function isDebugEnabled() {
  try {
    if (isBrowser()) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("debug") === "1") return true;
      if (window.localStorage?.getItem("streamly:debug") === "1") return true;
    }
  } catch {
    // storage / URL access blocked — fall through to env check
  }
  try {
    // Vite injects import.meta.env; guard for non-Vite runtimes (tests).
    // eslint-disable-next-line no-undef
    return Boolean(import.meta?.env?.DEV);
  } catch {
    return false;
  }
}

function fmt(scope) {
  return scope ? `${PREFIX}[${scope}]` : PREFIX;
}

function safeContext(ctx) {
  if (ctx === undefined) return undefined;
  try {
    // Avoid logging the TMDB api_key if a full URL ever slips through.
    if (typeof ctx === "string") return ctx.replace(/api_key=[^&]*/gi, "api_key=***");
    if (ctx && typeof ctx === "object") {
      const clone = Array.isArray(ctx) ? [...ctx] : { ...ctx };
      if (!Array.isArray(clone) && clone.url && typeof clone.url === "string") {
        clone.url = clone.url.replace(/api_key=[^&]*/gi, "api_key=***");
      }
      return clone;
    }
    return ctx;
  } catch {
    return undefined;
  }
}

function describeError(error) {
  if (!error) return { message: "Unknown error" };
  if (typeof error === "string") return { message: error };
  const out = {
    message: error.message || String(error),
    name: error.name,
  };
  if (error.status !== undefined) out.status = error.status;
  if (error.code !== undefined) out.code = error.code;
  if (error.cause !== undefined) {
    try {
      out.cause = error.cause?.message || String(error.cause);
    } catch {
      // ignore
    }
  }
  return out;
}

export function logInfo(scope, message, context) {
  try {
    const ctx = safeContext(context);
    if (ctx === undefined) console.info(fmt(scope), message);
    else console.info(fmt(scope), message, ctx);
  } catch {
    // logging must never break the app
  }
}

export function logWarn(scope, message, context) {
  try {
    const ctx = safeContext(context);
    if (ctx === undefined) console.warn(fmt(scope), message);
    else console.warn(fmt(scope), message, ctx);
  } catch {
    // ignore
  }
}

export function logError(scope, message, error, context) {
  try {
    const errInfo = describeError(error);
    const ctx = safeContext(context);
    // Keep the original error object as the last arg so the console shows
    // a full stack trace when one exists.
    if (ctx === undefined) console.error(fmt(scope), message, errInfo, error);
    else console.error(fmt(scope), message, errInfo, ctx, error);
  } catch {
    try {
      console.error(fmt(scope), message);
    } catch {
      // ignore
    }
  }
}

export function logDebug(scope, message, context) {
  try {
    if (!isDebugEnabled()) return;
    const ctx = safeContext(context);
    if (ctx === undefined) console.debug(fmt(scope), message);
    else console.debug(fmt(scope), message, ctx);
  } catch {
    // ignore
  }
}

/**
 * Standard "query returned nothing usable" warning. Use it wherever a page
 * would otherwise render an empty rail / grid / hero with no explanation.
 */
export function logEmptyData(scope, message, context) {
  logWarn(scope, `No data: ${message}`, {
    online: isBrowser() ? navigator.onLine : undefined,
    ...((context && typeof context === "object" ? context : { detail: context }) || {}),
  });
}

/**
 * Standard React Query failure log. Captures the query key, offline state,
 * HTTP status (when available) and the original error for stack traces.
 */
export function reportQueryError(scope, queryKey, error, extra) {
  logError(scope, `Query failed: ${Array.isArray(queryKey) ? queryKey.join(" / ") : String(queryKey)}`, error, {
    queryKey,
    online: isBrowser() ? navigator.onLine : undefined,
    ...(extra || {}),
  });
}

/**
 * One-line environment checkpoint. Call once on boot (main.jsx) so the
 * console always shows whether the TMDB key is present and whether the
 * browser is online — the two most common "nothing loads" causes.
 */
export function logBootDiagnostics(scope = "boot") {
  try {
    let hasTmdbKey = false;
    let tmdbKeySource = "missing";
    try {
      // eslint-disable-next-line no-undef
      const envKey = import.meta?.env?.VITE_TMDB_API_KEY;
      if (envKey && String(envKey).trim() && !String(envKey).includes("your_tmdb_api_key")) {
        hasTmdbKey = true;
        tmdbKeySource = "VITE_TMDB_API_KEY";
      } else {
        // tmdbClient falls back to a bundled key — data can still load.
        hasTmdbKey = true;
        tmdbKeySource = "bundled-fallback";
      }
    } catch {
      hasTmdbKey = false;
    }
    const info = {
      online: isBrowser() ? navigator.onLine : undefined,
      hasTmdbKey,
      tmdbKeySource,
      href: isBrowser() ? window.location.href : undefined,
    };
    if (!info.online) {
      logError(scope, "Browser is OFFLINE — TMDB/API requests will fail. Check network connection.", null, info);
    } else if (!hasTmdbKey) {
      logError(scope, "VITE_TMDB_API_KEY is missing and no fallback is available — TMDB requests will return 401.", null, info);
    } else {
      logInfo(scope, "App boot diagnostics", info);
    }
    return info;
  } catch (error) {
    logError(scope, "Failed to collect boot diagnostics", error);
    return undefined;
  }
}

/**
 * Global crash / rejection hooks. Call once from main.jsx so uncaught render
 * errors, failed dynamic imports (stale Vite chunks) and unhandled promise
 * rejections (usually a fetch that nobody caught) all land in the console
 * with a consistent prefix instead of disappearing.
 */
let globalsInstalled = false;
export function initGlobalErrorLogging() {
  if (!isBrowser() || globalsInstalled) return;
  globalsInstalled = true;
  try {
    window.addEventListener("error", (event) => {
      const err = event?.error || event?.message;
      logError("window", "Uncaught error", err, {
        message: event?.message,
        filename: event?.filename,
        lineno: event?.lineno,
        colno: event?.colno,
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      logError("window", "Unhandled promise rejection (likely an uncaught fetch)", event?.reason, {
        online: navigator.onLine,
      });
    });
    window.addEventListener("offline", () => {
      logError("network", "Browser went OFFLINE — in-flight TMDB requests will fail.", null, {
        href: window.location.href,
      });
    });
    window.addEventListener("online", () => {
      logInfo("network", "Browser is back ONLINE — retry failed rails (refetch / reload).");
    });
  } catch (error) {
    console.error(`${PREFIX}[window] Failed to install global error logging`, error);
  }
}
