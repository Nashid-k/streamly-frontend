// src/constants/playback.js — which playback engine the details page mounts.
//
// PROVIDER_EMBED_PLAYBACK = true
//   Play through the PROVIDER'S OWN player in an iframe (ProviderEmbedPlayer).
//   The album's only live backend is ZXC/vidstuck, which migrated to a v2 API
//   whose token mint refuses every server-side request we can make — while the
//   provider's page mints and plays fine in a browser. Until the mint is solved
//   (or a backend that speaks to our resolver returns), the browser-driven
//   embed is the only reliable path, so it is the default.
//
// PROVIDER_EMBED_PLAYBACK = false
//   Play through the app's own NativePlayerView (native HLS via the serverless
//   + Cloudflare relay). Flip this back on when the resolver can obtain a
//   manifest again; both engines stay wired, so the switch is one line and no
//   component is deleted.

export const PROVIDER_EMBED_PLAYBACK = true;
