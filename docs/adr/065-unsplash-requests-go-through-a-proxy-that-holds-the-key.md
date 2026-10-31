# ADR-065: Unsplash requests go through a Cloudflare Worker that holds the Access Key

**Status: Accepted** (implemented and deployed to `https://clutter-unsplash-proxy.vigram-work.workers.dev`; deployment and release steps are in `workers/unsplash-proxy/README.md`)

## Context

Clutter called `api.unsplash.com` directly with an Access Key read from `VITE_UNSPLASH_ACCESS_KEY`. Every `VITE_*` value is compiled into the frontend bundle, so a shipped app carried the key in plain text, readable by anyone who opened the app's files, and the key's hourly quota was shared with whoever extracted it. ADR-054 deliberately left a server-side proxy "out of scope" until the app shipped. Unsplash has confirmed in writing that proxying through a server-side component to protect the key is permitted.

## Decision

1. **The key lives only in a Worker** (`workers/unsplash-proxy`, deployed separately) as the `UNSPLASH_ACCESS_KEY` secret binding. The app has no key, sends no credentials and no custom headers: a request is a plain `GET` to the proxy, so a browser sends no CORS preflight.
2. **The proxy offers exactly the operations Clutter uses**: `GET /search/photos`, `GET /photos/:id` and `GET /photos/:id/download` (plus `/health`), mirroring Unsplash's own paths. Every upstream URL is built from validated parts (an allow-list for each parameter; unknown, duplicate and oversized input refused), on the constant host `api.unsplash.com`. Nothing a client sends (headers, cookies, body) is forwarded.
3. **Responses are re-validated, not passed through.** Each photo is reduced to the fields Clutter uses, in Unsplash's own names, and dropped unless its image URLs are on Unsplash's image hosts, its profile link is on `unsplash.com` and its `download_location` is the exact `api.unsplash.com/photos/<id>/download?ixid=…` for the same photo. Upstream errors are mapped to a small fixed set (`not_found`, `rate_limited`, `upstream_error`, `upstream_timeout`); an upstream body is never returned.
4. **Attribution is unchanged and untouched** (ADR-054): the photographer's name and profile link and the image URLs (with their `ixid`) are returned exactly as Unsplash sent them, the app still adds the referral parameters when it displays a credit, and the download is still reported when a photo is committed or saved.
5. **`download_location` stays in Unsplash's own form** in the note's frontmatter (`coverCredit`), so a saved note never depends on the proxy's address. At report time the app takes the photo id and `ixid` from it and asks the proxy for `/photos/<id>/download?ixid=…`; anything that is not a download location on `api.unsplash.com` is ignored.
6. **Abuse control**: a per-client rate limit at the edge (60 requests per 60 seconds per IP, a Workers Rate Limiting binding) answered with `429` and `Retry-After` before Unsplash is called, so one client cannot spend the shared quota; a CORS allow-list of the packaged app's origins only (`tauri://localhost`, `http(s)://tauri.localhost`; the dev servers' origins are added only in a local `.dev.vars`, never in the deployed configuration; CORS is not authentication, and the limit is what stops a non-browser client); version preview URLs off (`preview_urls = false`); strict method, path and length checks; an upstream timeout; and redirects refused. Cloudflare Workers does not support `redirect: 'error'` (it throws before the request is sent), so the Worker asks for `redirect: 'manual'` and answers any 3xx from Unsplash with the generic `502`, without following or logging the target.
7. **Nothing sensitive is logged or returned**: the key is only ever sent to Unsplash in an `Authorization` header; log lines carry an event name and a status, never a key, a search term or a photo id; responses carry `Cache-Control: no-store`.
8. **The proxy's address** is public, defaults to the deployed Worker in `UnsplashApi.ts`, and is overridden with `VITE_UNSPLASH_PROXY_URL` (empty turns Unsplash off). The app's Content-Security-Policy `connect-src` names the proxy's origin (not `api.unsplash.com`); changing the address means changing both.

## Consequences

- The shipped app contains no Unsplash credential. A key that was ever in a bundle built before this change must be treated as exposed and **rotated** after the Worker is deployed.
- All users share the one Access Key's Unsplash quota; the proxy's per-client limit protects it but does not raise it (a Production-approved key has a far higher hourly limit than a Demo key). Which tier the application is on, and that approval has been granted, is **not recorded here** and must be confirmed before a public release (checklist item 22 in `docs/building-and-distribution.md`).
- Unsplash search and the paste-a-link cover need the proxy to be reachable; when it is not, the pickers show a plain message chosen from the failure's kind (request limit reached, temporarily unreachable, temporarily unavailable, or a neutral failure), never the raw error; the kind and HTTP status, and nothing else, go to the console.
- The proxy does not cache. Caching Unsplash responses at the edge would cut upstream use but is not covered by the written confirmation about proxying and is left as a decision.

## Alternatives considered

- **Keep the key in the app** (status quo): rejected; the key is extractable from every shipped build.
- **Pass Unsplash's JSON through unchanged**: rejected; it would forward fields Clutter does not use and trust upstream content for the attribution and download links. Re-validating keeps a compromised or unexpected response from reaching the app.
- **A generic `/proxy?url=` forwarder**: rejected; an open forwarder is an abuse target. Only the three operations, with their parameters, exist.
- **Rewrite `download_location` to the proxy's address**: rejected; it is persisted in notes (ADR-054), and the proxy's address may change.
