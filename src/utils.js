/**
 * Shared utilities.
 *
 * `asArray`/`EMPTY_ARRAY` normalize backend payloads that can briefly return
 * non-array bodies (cold-start errors, object envelopes, 503 stubs) so a
 * single truthy-but-not-array value can never crash a render.
 */
export const EMPTY_ARRAY = [];

export const asArray = (x) => (Array.isArray(x) ? x : EMPTY_ARRAY);

export const decodeUrl = (encodedStr) => {
  if (!encodedStr || encodedStr.startsWith("http")) return encodedStr;
  try {
    const secret = import.meta.env.VITE_URL_DECODE_KEY;
    if (!secret) return encodedStr; // Guard: env var not set
    const decodedB64 = atob(encodedStr);
    return decodedB64
      .split("")
      .map((char, i) =>
        String.fromCharCode(
          char.charCodeAt(0) ^ secret.charCodeAt(i % secret.length),
        ),
      )
      .join("");
  } catch {
    return encodedStr;
  }
};
