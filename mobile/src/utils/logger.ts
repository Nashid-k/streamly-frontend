/* Diagnostics for the Android app.
 *
 * Same contract as the web build (src/utils/debugLogger.js): every data failure
 * is logged with a `[Streamly][scope]` prefix and never swallowed. In the app
 * these lines land in `adb logcat`, which is the only console a phone has, so
 * logcat output is the equivalent of the browser console here. */

type Scope = string;

const PREFIX = "[Streamly]";

const enabled = () => {
  // Verbose output follows the web build's `streamly:debug` localStorage flag.
  try {
    if (process.env.EXPO_PUBLIC_DEBUG === "1") return true;
  } catch {
    // no env access
  }
  return false;
};

function emit(kind: "log" | "warn" | "error", scope: Scope, message: string, context?: unknown) {
  const line = `${PREFIX}[${scope}] ${message}`;
  if (kind === "error") console.error(line, context ?? "");
  else if (kind === "warn") console.warn(line, context ?? "");
  else if (enabled()) console.log(line, context ?? "");
}

export function logDebug(scope: Scope, message: string, context?: unknown) {
  emit("log", scope, message, context);
}

export function logInfo(scope: Scope, message: string, context?: unknown) {
  emit("log", scope, message, context);
}

export function logWarn(scope: Scope, message: string, context?: unknown) {
  emit("warn", scope, message, context);
}

export function logError(scope: Scope, message: string, error?: unknown, context?: unknown) {
  emit("error", scope, message, { message: describe(error), ...(context as object) });
}

export function logEmptyData(scope: Scope, what: string, context?: unknown) {
  logWarn(scope, `${what} resolved to nothing renderable.`, context);
}

export function describe(error: unknown): string {
  if (!error) return "unknown error";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}
