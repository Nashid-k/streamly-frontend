// src/constants/playback.js — hard override for which playback engine the
// details page mounts.
//
// The engine is normally chosen at RUNTIME from the deployment's capabilities:
// the client asks api/stream.js `capabilities` (the probe in TitleDetailsPage)
// whether the native resolver can reach the provider. That
// answer is `zxcNative`, which is true only when ZXC_RELAY_URL is configured
// (an Apps Script relay on a Google egress IP the provider's WAF allows — see
// server/net.js and apps-script/zxc-relay.gs).
//
//   zxcNative true  -> NativePlayerView (native HLS through the serverless).
//   zxcNative false -> ProviderEmbedPlayer (the provider's own player iframe),
//                      because our datacenter egress 502s every /backend call.
//
// PROVIDER_EMBED_PLAYBACK = true forces the embed regardless of capabilities —
// the escape hatch if the relay ever misbehaves in production. Leave it false
// so the runtime decision wins.

export const PROVIDER_EMBED_PLAYBACK = false;
