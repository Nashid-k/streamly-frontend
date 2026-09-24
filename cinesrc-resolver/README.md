# cinesrc-resolver

Mint-on-demand CineSrc playlist URLs in **real Chrome**. CineSrc's stream
tokens are fingerprint-bound (PoW + browser surface), so no serverless
function can mint them — this service loads the embed in headless Chrome,
watches network traffic for the first `/api/playlist/{id}` request, and
returns it. `api/downloadify.js` action `resolvecinesrc` calls it, then walks
master → variants → segments exactly like any other HLS source.

## Run locally

```bash
cd cinesrc-resolver
npm install
npm start  # :3100, uses system Chrome (CHROME_PATH to override)
curl -X POST localhost:3100/resolve \
  -H 'content-type: application/json' \
  -d '{"type":"movie","id":"1423191"}'
# -> {"ok":true,"playlistUrl":"https://cinesrc.st/api/playlist/..."}
```

## Deploy (pick one)

- **Docker**: `docker build -t cinesrc-resolver .`, run anywhere
  (`-p 3100:3100`), e.g. a $5 VPS, Railway, or Fly.io.
- **VPS**: Node 20 + Chrome + `npm install --omit=dev` + `node server.js`
  (use pm2/systemd to keep it up).

## Configure the app (no Vercel env needed)

Set the service origin in **`src/api/cinesrcResolver.js`**
(`CINESRC_RESOLVER_ORIGIN`) and redeploy the app — the client sends it with
every `resolvecinesrc` request, so the Vercel project needs no environment
variable:

```js
export const CINESRC_RESOLVER_ORIGIN = "https://resolver.example.com";
```

Operators who prefer a dashboard knob can instead (or additionally) set
**`CINESRC_RESOLVER_URL`** server-side on the Vercel project; it overrides the
client value without a redeploy. With neither configured, the app honestly
reports CineSrc downloads as unavailable — nothing breaks.

## Notes

- No auth on `/resolve`: **keep it private** (firewall/security group,
  Tailscale, or a reverse-proxy token). The URL itself is the secret.
- One resolve ≈ one page load + ~10–30s of rotation. `MAX_PAGES` (default
  2) bounds concurrency; playlist IDs expire in minutes, so resolve at
  download time, never cache across titles.
