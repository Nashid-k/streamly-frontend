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

## Deploy (pick one — all one-command, config files are in this folder)

| Host | Command to run | What's already here |
|---|---|---|
| **Render** (free 512MB) | `render blueprint launch --confirm` (run from repo root) | `render.yaml` at repo root |
| **Fly.io** (free-ish 512MB) | `cd cinesrc-resolver; fly launch --auto-confirm --no-deploy; fly deploy` | `fly.toml` |
| **Railway** ($5/mo) | `railway login; railway up` | `railway.json` |
| **Any VPS w/ Docker** | `cd cinesrc-resolver; docker compose up -d --build` | `docker-compose.yml` |

Plain-VPS (no Docker) alternative: Node 20 + Chrome + `npm install --omit=dev`
+ `node server.js` under pm2/systemd.

Small instances: all configs pin `MAX_PAGES=1` (one Chrome per mint — two
Chrome processes on a 512MB box risk OOM); the container image passes
`--disable-dev-shm-usage` so headless Chrome survives small `/dev/shm`.
`/healthz` is wired for Render/Fly health checks. After deploying grab the
public URL and add it to the app config (below).

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
  download time. The mint cache (`CACHE_TTL_MS`, default 60000) returns
  repeats of the SAME title within the window with no Chrome launch — it
  exists to eat the token-retry bursts (re-mints) that otherwise relaunch a
  renderer each time; on a 512MB free container that relaunch storm is what
  trips OOMKill. Broadcast caching across DIFFERENT titles is not safe —
  session tokens are not mutually interoperable.
