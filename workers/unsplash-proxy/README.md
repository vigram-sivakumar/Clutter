# Clutter Unsplash proxy

A small Cloudflare Worker that holds Clutter's Unsplash Access Key so the app never carries it. The app calls this
Worker; the Worker calls Unsplash. Decision record: [ADR-065](../../docs/adr/065-unsplash-requests-go-through-a-proxy-that-holds-the-key.md).

It is deployed **separately** from the app and is not part of the app's npm workspaces.

## Production configuration at a glance

| | |
| --- | --- |
| Worker URL | `https://clutter-unsplash-proxy.vigram-work.workers.dev` |
| App setting | `VITE_UNSPLASH_PROXY_URL`. Unset, the app uses the URL above (`DEFAULT_UNSPLASH_PROXY_URL` in `UnsplashApi.ts`); set and empty, Unsplash is off; otherwise an `https` origin with no path |
| App security policy | the Worker's origin in `connect-src` in `apps/app/src-tauri/tauri.conf.json`; change it together with the URL |
| Access Key | the Worker secret `UNSPLASH_ACCESS_KEY` **only**. Never a `VITE_*` variable, never in the app, this repository or a chat |
| Allowed browser origins | `tauri://localhost` (macOS app), `http://tauri.localhost` and `https://tauri.localhost` (Windows/Linux app). No dev-server origin |
| Preview URLs | off (`preview_urls = false` in `wrangler.toml`) |
| Rate limit | 60 requests per 60 seconds per client IP |

`test/config.test.ts` fails if the preview setting, the origin list, the absence of a key in `wrangler.toml` or the rate
limit changes by accident.

## What it does

| Request | Calls Unsplash | Returns |
| --- | --- | --- |
| `GET /search/photos?query=&page=&orientation=` | `GET /search/photos` (page size fixed at 30) | `{ "results": [photo, …] }` |
| `GET /photos/:id` | `GET /photos/:id` | one `photo` |
| `GET /photos/:id/download[?ixid=]` | `GET /photos/:id/download` (the "trigger a download" call) | `{ "ok": true }` |
| `GET /health` | nothing | `{ "ok": true }` |

A `photo` is `{ id, urls: { small, regular }, user: { name, links: { html } }, links: { download_location } }`, in
Unsplash's own field names. Attribution is preserved exactly as Unsplash sent it; the app adds the referral parameters
when it displays a credit and reports the download through `/photos/:id/download`.

- `query`: 1 to 100 characters, no control characters. `page`: 1 to 50 (default 1). `orientation`: `landscape`,
  `portrait` or `squarish` (default `portrait`). Anything else, unknown or repeated parameters, other paths and other
  methods are refused before Unsplash is called.
- Errors are `{ "error": "<code>" }` with `400` (`missing_query`, `invalid_page`, `unknown_parameter`, …), `404`
  (`not_found`), `405`, `414`, `429` (`rate_limited`, with `Retry-After`), `500` (`not_configured`), `502`
  (`upstream_error`) or `504` (`upstream_timeout`). Unsplash's own error body is never passed on.

## Security properties

- The key exists only as the `UNSPLASH_ACCESS_KEY` **secret** binding. It is sent to `api.unsplash.com` in an
  `Authorization` header and is never logged, returned or written to source, config or the app.
- Upstream URLs are built from validated values on a constant host. Nothing the client sends (headers, cookies, body) is
  forwarded. A redirect from Unsplash is refused, never followed (see "Redirects" below); upstream calls time out after 8 seconds.
- Responses are re-validated: a photo is dropped unless its image URLs are on Unsplash's image hosts, its profile link is
  on `unsplash.com` and its `download_location` is the exact download URL for that photo.
- Abuse control: 60 requests per 60 seconds per client IP (Workers Rate Limiting binding), CORS limited to the packaged
  app's origins, version preview URLs off, and the checks above. **CORS is not authentication**: a non-browser client can still call the Worker, and the
  rate limit is what bounds it.
- Logs carry an event name and a status only: never a key, a search term or a photo id. Observability is off.

## Deploy: exactly what you do in Cloudflare

You need a Cloudflare account and an Unsplash **Access Key** (from your application in the Unsplash developer dashboard).
**Do not paste the key into a chat, a file in this repository, or an environment variable of the app.**

1. **Install and sign in.**
   ```bash
   cd workers/unsplash-proxy
   npm install
   npx wrangler login        # opens a browser window to authorize Wrangler
   ```
2. **Check it before deploying** (builds the Worker and validates `wrangler.toml`; deploys nothing).
   ```bash
   npm test && npm run typecheck && npm run build:check
   ```
3. **Deploy.** `wrangler.toml` is the source of truth for `ALLOWED_ORIGINS`, `preview_urls` and the rate limiter, so a
   deploy sets them. The Worker name in `wrangler.toml` (`clutter-unsplash-proxy`) is the name of the placeholder you created,
   so this replaces it and keeps the URL `https://clutter-unsplash-proxy.vigram-work.workers.dev`.
   ```bash
   npx wrangler deploy
   ```
   If Wrangler warns that it would overwrite variables defined in the dashboard, that is only the placeholder's own
   variables: `ALLOWED_ORIGINS` and the rate limiter now come from `wrangler.toml`. Secrets are never overwritten.
4. **Set the secret.** Run this and paste the key at the prompt (the terminal does not echo it):
   ```bash
   npx wrangler secret put UNSPLASH_ACCESS_KEY
   ```
   Or in the dashboard: **Workers & Pages → clutter-unsplash-proxy → Settings → Variables and Secrets → Add**, type
   **Secret**, name `UNSPLASH_ACCESS_KEY`, paste the key, **Deploy**. (Do not use the plain **Text** type: it is visible.)
5. **Verify.**
   ```bash
   curl https://clutter-unsplash-proxy.vigram-work.workers.dev/health
   # {"ok":true}
   curl "https://clutter-unsplash-proxy.vigram-work.workers.dev/search/photos?query=architecture&orientation=landscape"
   # {"results":[{"id":"…","urls":{…},"user":{…},"links":{"download_location":"https://api.unsplash.com/photos/…"}}]}
   ```
   A `500 {"error":"not_configured"}` means the secret is not set yet. Watch live events with `npx wrangler tail`.
6. **Rotate the old key.** Every app build made before this change contains the old key in its files, so treat it as
   exposed. In the Unsplash developer dashboard **regenerate the Access Key**, then repeat step 4 with the new key. Old
   builds stop reaching Unsplash (which is the point); users get Unsplash back by updating.
7. **Clean up locally.** Delete the `VITE_UNSPLASH_ACCESS_KEY=…` line from `apps/app/.env.local` (the app no longer reads
   it, and the file is git-ignored). Nothing needs to be set for the app: it already points at the Worker above.

### Redirects: `redirect: 'error'` does not work on Cloudflare Workers

The first deployed version called Unsplash with `redirect: 'error'` and every request failed with a 502
(`upstream_unreachable`, category `redirect`). Cloudflare's runtime accepts only `follow` and `manual` for `fetch`, and
throws a `TypeError` for `error` before any request is sent. The unit tests did not catch it because they use a fake
`fetch` that accepts any option. The Worker now uses `redirect: 'manual'` and treats any 3xx answer as an upstream
failure: it answers `502 upstream_error`, logs only `{"event":"upstream_redirect","route":…,"status":…}`, and never
follows, logs or returns the redirect target. `test/proxy.test.ts` ("redirects") fails if `error` comes back. Unsplash's
API does not redirect, so a logged `upstream_redirect` is unexpected and worth a look.

### If the Worker's URL changes

Set `VITE_UNSPLASH_PROXY_URL` for the app build, **and** change the origin in `connect-src` in
`apps/app/src-tauri/tauri.conf.json`, or the packaged app's security policy blocks the requests. (An empty
`VITE_UNSPLASH_PROXY_URL` turns Unsplash off in the app.)

### If the rate-limit binding is rejected

The `[[ratelimits]]` block in `wrangler.toml` is optional for the code (without it no per-client limit applies). If your
account cannot use the binding, deploy without it only after adding an equivalent limit in Cloudflare, because without
one a single client can spend the whole Unsplash quota.

## Local development

```bash
cp .dev.vars.example .dev.vars   # then put a key in .dev.vars; the file is git-ignored
npm run dev                      # http://localhost:8787
```
To try it from the app, run the web dev server with `VITE_UNSPLASH_PROXY_URL=http://localhost:8787` (the packaged and
`tauri dev` app's security policy only allows the deployed origin).

The deployed Worker does not allow the dev servers' origins. `.dev.vars.example` sets `ALLOWED_ORIGINS` to include
`http://localhost:1421` and `http://localhost:5173`; `.dev.vars` overrides the value in `wrangler.toml` for `wrangler dev`
only (checked with Wrangler 4.156) and is never deployed. Keep the dev origins out of `wrangler.toml`.

## Before a public release

Do these against the deployed Worker; none is done by deploying. `docs/building-and-distribution.md` (checklist items 21
to 23) tracks their status.

1. **Confirm the Unsplash application's approval and quota.** In the Unsplash developer dashboard, check whether the
   application is in **Demo** or approved for **Production**, and what hourly request limit applies. Every Clutter user
   shares that one limit through this Worker, and the per-client rate limit above protects it but does not raise it.
   Applying for Production approval is Unsplash's process and needs the application's attribution and download tracking
   in place (ADR-054); this repository does not record that it has been granted.
2. **Check the configuration that is deployed**, not just the file: the secret `UNSPLASH_ACCESS_KEY` exists (a missing
   one answers `500 not_configured`), preview URLs are off, and the origin variable holds only the three packaged-app
   origins.
3. **Check it live.** `/health` returns `{"ok":true}`; a search returns `200` with `results`; a request with
   `Origin: https://example.invalid` gets no `Access-Control-Allow-Origin` header; `npx wrangler tail` shows no
   `upstream_unreachable`, `upstream_redirect` or `upstream_status` lines for those calls. Do not call the `/download`
   route with a real photo to test it: it records a download for the photographer.
4. **Check the app build** points at this Worker (its default, or `VITE_UNSPLASH_PROXY_URL`), the policy in
   `tauri.conf.json` names the same origin, and no build output contains the Access Key.

## Limits to know about

- All users share the one Access Key's Unsplash quota. A key approved for Production has a far higher hourly limit than a
  Demo key; check which yours is.
- The Worker does not cache. Caching Unsplash responses would cut upstream use, but it is not covered by Unsplash's
  written confirmation about proxying, so it is left as a decision for you.
- Not exercised against the live Unsplash API in development (no key is available there): the tests use realistic
  fixtures. Do step 5 after deploying.
