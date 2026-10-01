import { useCallback, useEffect, useState } from "react";
import {
  LEGACY_ENV_VAR,
  LEGACY_STORAGE_KEY,
  PLAYER_FLAG_SCOPE,
  resolvePlayerVariant,
} from "../constants/playerFlag";
import { logInfo, logWarn } from "../utils/debugLogger";

/**
 * Live view of the PLAYER V2 rollout flag.
 *
 * `resolvePlayerVariant` is a pure function, so this hook is only the React
 * shell around it: read once, then re-read when the `storage` event fires
 * (another tab toggled it) or when `forceLegacy` is called (this tab did).
 *
 * A flag that can only be read at build time is not a safety net for a
 * production incident — by the time a redeploy finishes, viewers have left.
 * That is why the write path exists at all.
 *
 * @returns {{ useLegacy: boolean, reason: string, setLegacy: (on: boolean) => void }}
 */
export default function usePlayerVariant() {
  const read = useCallback(() => {
    const envValue =
      typeof import.meta !== "undefined" ? import.meta.env?.[LEGACY_ENV_VAR] : undefined;
    return resolvePlayerVariant(envValue);
  }, []);

  const [variant, setVariant] = useState(read);

  useEffect(() => {
    const onStorage = (event) => {
      // Other keys changing is not our business; re-reading on every unrelated
      // localStorage write would re-render the player for unrelated reasons.
      if (event?.key && event.key !== LEGACY_STORAGE_KEY) return;
      const next = read();
      setVariant(next);
      logInfo(PLAYER_FLAG_SCOPE, `variant changed to ${next.reason}`);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [read]);

  const setLegacy = useCallback(
    (on) => {
      try {
        if (on) {
          window.localStorage.setItem(LEGACY_STORAGE_KEY, "1");
        } else {
          window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
        const next = read();
        setVariant(next);
        logInfo(PLAYER_FLAG_SCOPE, `variant set to ${next.reason}`);
      } catch (error) {
        // A failed write must not look like a successful toggle: say so instead
        // of leaving the caller believing it fell back.
        logWarn(PLAYER_FLAG_SCOPE, "legacy override write failed", error);
      }
    },
    [read],
  );

  return { useLegacy: variant.useLegacy, reason: variant.reason, setLegacy };
}
