// src/constants/playback.js — which playback engine the details page mounts.
//
// PROVIDER_EMBED_PLAYBACK = false
//   Play through the app's own NativePlayerView (native HLS via the serverless
//   + Cloudflare relay). This is the default again: the provider's v2 "sources"
//   contract is now solved server-side (the mint `POST /backend/fucku` takes the
//   `{id, mediaType, path}` body and the DASH/`/backend_/sources/{server}`
//   response decrypts), so the resolver obtains a manifest directly.
//
// PROVIDER_EMBED_PLAYBACK = true
//   Fall back to the PROVIDER'S OWN player in an iframe (ProviderEmbedPlayer).
//   Kept wired as an escape hatch: if the provider renames the mint/sources
//   contract again and the native resolver cannot self-heal in time, one line
//   restores the browser-driven embed. No component is ever deleted.

export const PROVIDER_EMBED_PLAYBACK = false;
