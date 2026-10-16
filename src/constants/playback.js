// src/constants/playback.js — which playback engine the details page mounts.
//
// PROVIDER_EMBED_PLAYBACK = true  (current)
//   Play through the PROVIDER'S OWN player in an iframe (ProviderEmbedPlayer).
//   The provider put its /backend/* API behind a Cloudflare WAF that blocks
//   every datacenter IP (Vercel's bom1 egress, Cloudflare Workers, datacenter
//   CORS proxies) while allowing residential browsers — so the native resolver
//   can never obtain a manifest from our server, no matter the URL or contract.
//   The provider's embed runs in the viewer's own browser (a residential IP the
//   provider allows), so it is the only path that plays without extra
//   infrastructure. See architecture.md.
//
// PROVIDER_EMBED_PLAYBACK = false
//   Play through the app's own NativePlayerView (native HLS via the serverless
//   + Cloudflare relay). Only viable from an egress the provider's WAF allows
//   (e.g. residential or a Google Cloud relay); from Vercel/Cloudflare
//   serverless it dies on the first `/backend` call.

export const PROVIDER_EMBED_PLAYBACK = true;
