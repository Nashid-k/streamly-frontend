// CineSrc resolver origin (cinesrc-resolver/ — a separate, always-on Chrome
// mint service, README in that folder).
//
// The web app has no server of its own for CineSrc: stream tokens are minted
// inside a real browser, so minting runs on a self-hosted cinesrc-resolver
// instance that `api/downloadify.js` action "resolvecinesrc" calls. The origin
// is shipped IN THIS CLIENT BUNDLE and sent with every request, so a Vercel
// deployment needs NO `CINESRC_RESOLVER_URL` env var — update this constant
// and redeploy the app. An operator can still set `CINESRC_RESOLVER_URL`
// server-side to override the client value without a redeploy.
//
// Leave "" to disable CineSrc downloads (the server then reports the source
// as unavailable and VidSrc (Alt) fills the download sheet).
//
// Keep the value pointing at a PRIVATE origin (hard-to-guess subdomain, and
// firewall or reverse-proxy-token protect it — the resolver has no auth, and
// this URL is public once shipped).
export const CINESRC_RESOLVER_ORIGIN = "";